// 試作C: 起点の名前・別名・作品名から検索語を組み立て、Claude の Web 検索で記事のURLを集めて spike/out/c/ に書き出す。
//   pnpm spike:search --dry-run      APIを呼ばずに、検索語の一覧と見積もり額を出す（作品名の取得に iTunes と Wikidata は呼ぶ）
//   pnpm spike:search [--only id]    実際に検索する（結果はキャッシュし、同じ検索語と設定では呼ばない）
//   pnpm spike:search --report       review.md の判定を読み、summary.md（引用もURLも含まない数値）を書く
//   pnpm spike:search --snippets     上位 TOP 位までのURLの本文を取り、下書きの判定用の抜粋 snippets.txt を書く
//   pnpm spike:search --review       drafts.json（下書きの判定）を入れて、上位 TOP 位までの review.md を作り直す
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSnippets } from "./draft.mjs";
import { readJudgments, topUrls, urlKey, writeReview, writeSummary } from "./report.mjs";
import {
  BLOCKED_DOMAINS,
  buildQueries,
  configVersion,
  GUESS,
  MODEL,
  search,
  yen,
} from "./search.mjs";
import { seedWorks } from "./works.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "out", "c");
const BUDGET_YEN = 100;
const SEEDS = ["mico", "minami", "tanaka"];
// 本人が判定するのは、各検索の上位 TOP 位まで（全部で145件あり、読むのが重いため）
const TOP = 3;
const log = (s) => process.stdout.write(`${s}\n`);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reportOnly = args.includes("--report");
const snippets = args.includes("--snippets");
const reviewOnly = args.includes("--review");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

try {
  process.loadEnvFile(join(root, "..", ".env"));
} catch {}

const likes = JSON.parse(readFileSync(join(root, "data", "likes.json"), "utf8"));
const seeds = SEEDS.map((id) => likes.seeds.find((s) => s.id === id)).filter(
  (s) => s && (!only || s.id === only),
);

/** 試作A・Bで手に入れた、その起点の記事・動画（見つかったかを自動で数える）。 */
function knownSources(seedId) {
  const ids = new Set(
    likes.likes.filter((l) => l.seed === seedId).flatMap((l) => l.evidence.map((e) => e.source)),
  );
  return [...ids].map((id) => ({ id, ...likes.sources[id] })).filter((s) => s.url);
}

async function main() {
  mkdirSync(join(OUT, "runs"), { recursive: true });
  const draftsFile = join(OUT, "drafts.json");
  const drafts = existsSync(draftsFile) ? JSON.parse(readFileSync(draftsFile, "utf8")) : {};
  if (snippets || reviewOnly) {
    const runs = JSON.parse(readFileSync(join(OUT, "runs.json"), "utf8"));
    if (snippets) log(`→ ${await writeSnippets(OUT, runs, likes.seeds, TOP)}`);
    else log(`→ ${writeReview(OUT, runs, { top: TOP, drafts })}`);
    log(`上位${TOP}位までのURL: ${runs.reduce((n, r) => n + topUrls(r, TOP).length, 0)}件`);
    return;
  }
  if (reportOnly) {
    const runs = JSON.parse(readFileSync(join(OUT, "runs.json"), "utf8"));
    const judged = readJudgments(join(OUT, "review.md"));
    writeSummary(OUT, runs, judged, { model: MODEL, configVersion, top: TOP, drafts });
    log(`→ ${join(OUT, "summary.md")}`);
    return;
  }
  const works = await seedWorks(seeds, OUT);
  const plan = seeds.map((s) => ({
    seed: s,
    works: works[s.id].works,
    queries: buildQueries(s, works[s.id].works),
    known: knownSources(s.id),
  }));
  const perQuery = yen({ searches: 1, ...GUESS });
  const total = plan.reduce((n, p) => n + p.queries.length, 0);
  for (const p of plan) {
    log(`\n${p.seed.name}（作品: ${p.works.join("、") || "なし"}）`);
    for (const q of p.queries) log(`  [${q.template}] ${q.query}`);
    log(`  既知の記事・動画: ${p.known.map((k) => k.id).join("、") || "なし"}`);
  }
  log(
    `\n検索 ${total}回 × 約${perQuery.toFixed(2)}円 = 見積もり ${(total * perQuery).toFixed(1)}円（上限 ${BUDGET_YEN}円）`,
  );
  log(`除外するドメイン: ${BLOCKED_DOMAINS.join(", ")}`);
  if (dryRun) return;

  let spent = 0;
  const runs = [];
  for (const p of plan) {
    const queries = [];
    for (const q of p.queries) {
      const h = createHash("sha256").update(q.query).digest("hex").slice(0, 10);
      const cacheFile = join(OUT, "runs", `${p.seed.id}.${h}.${configVersion}.json`);
      let r;
      if (existsSync(cacheFile)) {
        r = JSON.parse(readFileSync(cacheFile, "utf8"));
      } else {
        if (spent + perQuery > BUDGET_YEN)
          throw new Error(`予算 ${BUDGET_YEN} 円を超えるので止める`);
        r = await search(q.query);
        writeFileSync(cacheFile, JSON.stringify(r, null, 1));
        spent += yen(r.usage);
      }
      const changed = r.usedQueries.some((u) => u !== q.query);
      log(
        `${p.seed.id.padEnd(7)} [${q.template}] ${r.results.length}件${changed ? `（検索語が変わった: ${r.usedQueries.join(" / ")}）` : ""}${r.errors.length ? ` エラー: ${r.errors.join(",")}` : ""}`,
      );
      queries.push({ ...q, ...r });
    }
    const knownKeys = new Map(p.known.map((k) => [urlKey(k.url), k.id]));
    const found = new Set(queries.flatMap((q) => q.results.map((x) => urlKey(x.url))));
    runs.push({
      seed: { id: p.seed.id, name: p.seed.name },
      works: p.works,
      queries,
      known: [...knownKeys].map(([key, id]) => ({ id, found: found.has(key) })),
    });
  }
  writeFileSync(join(OUT, "runs.json"), JSON.stringify(runs, null, 1));
  const reviewPath = writeReview(OUT, runs, { top: TOP, drafts });
  log(`\n今回の実費: ${spent.toFixed(2)}円 → ${reviewPath}`);
}

await main();
