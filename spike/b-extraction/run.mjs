// 試作B: 記事と文字起こしから「好き」を抜き出し、本文側の位置と照合して spike/out/b/ に書き出す。
//   pnpm spike:extract --dry-run     LLMを呼ばずに、フィルタ前後の字数と見積もり額を出す
//   pnpm spike:extract [--only id]   実際に Haiku を呼ぶ（結果はキャッシュし、同じ本文とプロンプトでは呼ばない）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getArticle } from "./article.mjs";
import {
  estimateTokens,
  extract,
  MODEL,
  promptVersion,
  SYSTEM,
  userMessage,
  yen,
} from "./extract.mjs";
import { locate } from "./match.mjs";
import {
  excerpt,
  inUnits,
  paragraphUnits,
  selectArticleUnits,
  selectTranscriptUnits,
} from "./prefilter.mjs";
import { writeReport } from "./report.mjs";
import { parseTranscript, secAt, timeLink } from "./transcript.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "out", "b");
const BUDGET_YEN = 50;
const log = (s) => process.stdout.write(`${s}\n`);
// 出力（思考を含む）の見込み。高めに置く
const OUTPUT_TOKENS_GUESS = 3000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

try {
  process.loadEnvFile(join(root, "..", ".env"));
} catch {}

const likes = JSON.parse(readFileSync(join(root, "data", "likes.json"), "utf8"));
const TRANSCRIPTS = { goroom: "goroom-zenpen.txt", "goroom-kouhen": "goroom-kouhen.txt" };

function buildInputs() {
  const sources = { ...likes.sources };
  sources["goroom-kouhen"] ??= {
    title: "【後編】本について語る（語ROOM）",
    url: null,
    kind: "video",
  };
  return Object.entries(sources).map(([id, s]) => {
    const seedIds = new Set(
      likes.likes.filter((l) => l.evidence.some((e) => e.source === id)).map((l) => l.seed),
    );
    if (id === "goroom-kouhen") seedIds.add("mico");
    const seeds = likes.seeds.filter((x) => seedIds.has(x.id));
    const gold = likes.likes.flatMap((l) =>
      l.evidence
        .filter((e) => e.source === id)
        .map((e) => ({
          ...e,
          seed: l.seed,
          creator: likes.creators.find((c) => c.id === l.creator),
        })),
    );
    return { id, ...s, kind: s.kind === "video" ? "transcript" : "article", seeds, gold };
  });
}

async function loadText(input) {
  if (input.kind === "transcript") {
    const raw = readFileSync(join(root, "data", "transcripts", TRANSCRIPTS[input.id]), "utf8");
    const t = parseTranscript(raw);
    return { body: t.body, units: t.segments, segments: t.segments, sep: "\n" };
  }
  const a = await getArticle(input.id, input.url, OUT);
  return { body: a.body, units: paragraphUnits(a.paragraphs), sep: "\n\n" };
}

const creatorNames = (c) => [
  c.name,
  ...(c.aliases ?? []),
  ...Object.values(c.workAliases ?? {}).flat(),
];
const norm = (s) =>
  (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･]/gu, "");
const sameName = (a, b) =>
  norm(a) && norm(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));

function knownCreator(name) {
  return likes.creators.find((c) => creatorNames(c).some((n) => sameName(n, name)));
}

function isSeed(input, name) {
  return input.seeds.some((s) => [s.name, ...s.aliases].some((n) => sameName(n, name)));
}

function verify(input, text, statements) {
  return statements.map((st) => {
    const c = knownCreator(st.object_name) ?? (st.work_title && knownCreator(st.work_title));
    const names = [st.object_name, st.work_title, ...(c ? creatorNames(c) : [])];
    const r = locate(text.body, st.quote, names);
    const sec = r.span && text.segments ? secAt(text.segments, r.span.start) : null;
    return {
      ...st,
      subjectIsSeed: isSeed(input, st.subject_name),
      match: r.match,
      similarity: Number(r.similarity.toFixed(3)),
      reason: r.reason ?? null,
      span: r.span ?? null,
      nearest: r.nearest ?? null,
      sec,
      link: input.kind === "transcript" ? timeLink(input.url, sec) : input.url,
    };
  });
}

/** 手入力の正解（likes.json）のうち、拾えたもの。 */
function compareGold(input, text, selected, results) {
  return input.gold.map((g) => {
    const names = [...creatorNames(g.creator), g.work];
    const where = locate(text.body, g.quote, names);
    const inFilter = where.span ? inUnits(selected, where.span.start) : null;
    const found = results.some(
      (r) =>
        r.match !== "none" &&
        r.subjectIsSeed &&
        ["likes", "influenced_by", "past_like"].includes(r.polarity) &&
        names.some((n) => sameName(n, r.object_name) || sameName(n, r.work_title)),
    );
    return {
      creator: g.creator.name,
      work: g.work ?? null,
      goldMatch: where.match,
      inFilter,
      found,
    };
  });
}

async function main() {
  mkdirSync(join(OUT, "runs"), { recursive: true });
  const inputs = buildInputs().filter((i) => !only || i.id === only);
  const sysTokens = estimateTokens(SYSTEM);
  let spent = 0;
  let estimated = 0;
  const summaries = [];
  for (const input of inputs) {
    let text;
    try {
      text = await loadText(input);
    } catch (e) {
      log(`${input.id}: 読み込めない (${e.message})`);
      summaries.push({ id: input.id, error: e.message });
      continue;
    }
    const selected =
      input.kind === "transcript"
        ? selectTranscriptUnits(text.body, text.segments)
        : selectArticleUnits(text.body, text.units);
    const ex = excerpt(text.body, selected, text.sep);
    const message = userMessage({
      title: input.title,
      kind: input.kind,
      seedNames: input.seeds.flatMap((s) => [s.name, ...s.aliases]),
      text: ex,
    });
    const est = { input: sysTokens + estimateTokens(message), output: OUTPUT_TOKENS_GUESS };
    const estYen = selected.length ? yen(est) : 0;
    estimated += estYen;
    const line = `${input.id.padEnd(14)} ${input.kind.padEnd(10)} 本文 ${String(text.body.length).padStart(6)}字 → 抜き出し ${String(ex.length).padStart(6)}字  見積もり 入力≒${est.input} 出力≒${est.output} トークン  ${estYen.toFixed(2)}円`;
    const goldPre = compareGold(input, text, selected, []);
    const passed = goldPre.filter((g) => g.inFilter).length;
    log(`${line}  正解 ${passed}/${goldPre.length} がフィルタを通る`);
    for (const g of goldPre.filter((x) => !x.inFilter)) {
      log(
        `    落ちた正解: ${g.creator}${g.work ? `『${g.work}』` : ""}（本文での照合: ${g.goldMatch}）`,
      );
    }
    if (dryRun) continue;

    const cacheFile = join(OUT, "runs", `${input.id}.${MODEL}.${promptVersion}.json`);
    let run;
    if (existsSync(cacheFile)) {
      run = JSON.parse(readFileSync(cacheFile, "utf8"));
    } else if (!selected.length) {
      run = { statements: [], usage: { input: 0, output: 0 } };
    } else {
      if (spent + estYen > BUDGET_YEN) throw new Error(`予算 ${BUDGET_YEN} 円を超えるので止める`);
      run = await extract(message);
      writeFileSync(cacheFile, JSON.stringify(run, null, 1));
      spent += yen(run.usage);
    }
    const results = verify(input, text, run.statements);
    const gold = compareGold(input, text, selected, results);
    const out = {
      input: { id: input.id, title: input.title, url: input.url, kind: input.kind },
      usage: run.usage,
      yen: yen(run.usage),
      results,
      gold,
    };
    writeFileSync(join(OUT, `${input.id}.json`), JSON.stringify(out, null, 1));
    summaries.push(out);
  }
  log(`\n見積もりの合計: ${estimated.toFixed(2)}円（上限 ${BUDGET_YEN}円）`);
  if (!dryRun) {
    writeReport(OUT, summaries, { model: MODEL, promptVersion });
    log(`今回の実費: ${spent.toFixed(2)}円 → ${join(OUT, "review.md")}`);
  }
}

await main();
