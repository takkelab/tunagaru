// 集めたURLを、本人が判定をつける review.md と、PR に書ける数値（引用もURLも含まない）の summary.md にする。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { yen } from "./search.mjs";

export const MARKS = {
  "◎": "その人の発言の記事で、好きな作り手・作品が出てくる",
  "○": "その人の発言の記事だが、好きな作り手・作品は出てこない",
  "×": "外れ（別人、本人の発言ではない、一覧・ストア・歌詞など）",
};

/** URL を比べるための形（プロトコル・www・末尾の / を落とす。YouTube は動画IDにする）。 */
export function urlKey(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^(www|m)\./u, "");
    if (host === "youtube.com" && u.searchParams.get("v")) {
      return `youtube:${u.searchParams.get("v")}`;
    }
    if (host === "youtu.be") return `youtube:${u.pathname.slice(1)}`;
    // ?id= で記事を分けるサイトがあるので、計測用（utm_ など）以外のクエリは残す
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/u.test(k)) u.searchParams.delete(k);
    }
    u.searchParams.sort();
    return `${host}${u.pathname.replace(/\/$/u, "")}${u.search}`;
  } catch {
    return raw;
  }
}

/** 起点ごとに、重複を除いたURLと、それを見つけた検索語（型と順位）。 */
export function uniqueUrls(run) {
  const byKey = new Map();
  for (const q of run.queries) {
    q.results.forEach((r, i) => {
      const key = urlKey(r.url);
      if (!byKey.has(key)) byKey.set(key, { key, ...r, foundBy: [] });
      byKey.get(key).foundBy.push({ template: q.template, query: q.query, rank: i + 1 });
    });
  }
  return [...byKey.values()];
}

/** 各検索の上位 top 位までに入ったURL。 */
export const topUrls = (run, top) =>
  uniqueUrls(run).filter((u) => u.foundBy.some((f) => f.rank <= top));

const draftKey = (run, u) => `${run.seed.id}|${u.key}`;

export function writeReview(dir, runs, { top, drafts = {} }) {
  const lines = [
    "# 試作C: 集まったURL（判定をつける）",
    "",
    `各検索の上位${top}位までに入ったURLだけを載せる。「判定:」には Claude Code の下書きが入っている。`,
    "違っていたら書き換える。迷ったら消して空にする（数えない）。",
    "",
    ...Object.entries(MARKS).map(([m, d]) => `- ${m} ${d}`),
    "",
    "このファイルは gitignore 済み。書き終えたら `pnpm spike:search --report`。",
    "",
  ];
  for (const run of runs) {
    const urls = topUrls(run, top);
    lines.push(`## ${run.seed.name}（${urls.length}件）`, "");
    const known = run.known.map((k) => `${k.id}: ${k.found ? "見つかった" : "見つからない"}`);
    lines.push(`既知の記事・動画: ${known.join("、") || "なし"}`, "");
    urls.forEach((u, i) => {
      const by = u.foundBy.map((f) => `[${f.template}] ${f.rank}位`).join("、");
      lines.push(
        // タイトルは見出しにしない（末尾の「！」などが markdownlint に当たるため）
        `### ${run.seed.id}-${i + 1}`,
        "",
        u.title,
        "",
        `<!-- seed:${run.seed.id} key:${u.key} -->`,
        `<${u.url}>`,
        "",
        `- 見つけた検索語: ${by}${u.page_age ? ` ／ 日付: ${u.page_age}` : ""}`,
        `- 判定:${drafts[draftKey(run, u)] ? ` ${drafts[draftKey(run, u)].mark}` : ""}`,
        ...(drafts[draftKey(run, u)] ? [`- 下書きの理由: ${drafts[draftKey(run, u)].reason}`] : []),
        "",
      );
    });
  }
  // 本人が判定を書き込んだ review.md は上書きしない（新しい結果は review.new.md に出す）
  const path = join(dir, existsSync(join(dir, "review.md")) ? "review.new.md" : "review.md");
  writeFileSync(path, `${lines.join("\n").trimEnd()}\n`);
  return path;
}

/** review.md の判定を読む。キーは `起点ID|URLのキー`。 */
export function readJudgments(path) {
  const marks = new Map();
  let current = null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^<!-- seed:(\S+) key:(\S+) -->$/u);
    if (m) current = `${m[1]}|${m[2]}`;
    const j = line.match(/^- 判定:\s*([◎○×])/u);
    if (j && current) {
      marks.set(current, j[1]);
      current = null;
    }
  }
  return marks;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function writeSummary(dir, runs, marks, { model, configVersion, top, drafts = {} }) {
  const tpl = new Map();
  const seedRows = [];
  let totalYen = 0;
  let changed = 0;
  for (const run of runs) {
    const urls = uniqueUrls(run);
    const mark = (u) => marks.get(`${run.seed.id}|${u.key}`);
    const cost = run.queries.reduce((n, q) => n + yen(q.usage), 0);
    totalYen += cost;
    changed += run.queries.filter((q) => q.usedQueries.some((x) => x !== q.query)).length;
    const judged = urls.filter(mark);
    const hits = judged.filter((u) => mark(u) !== "×");
    seedRows.push(
      `| ${run.seed.id} | ${run.queries.length} | ${urls.length} | ${judged.length} | ${judged.filter((u) => mark(u) === "◎").length} | ${hits.length} | ${pct(hits.length, judged.length)} | ${run.known.filter((k) => k.found).length}/${run.known.length} | ${cost.toFixed(2)} |`,
    );
    for (const q of run.queries) {
      const t = tpl.get(q.template) ?? { queries: 0, results: 0, keys: new Map() };
      t.queries += 1;
      t.results += q.results.length;
      tpl.set(q.template, t);
    }
    for (const u of urls) {
      const templates = new Set(u.foundBy.map((f) => f.template));
      for (const name of templates) {
        tpl
          .get(name)
          .keys.set(`${run.seed.id}|${u.key}`, { mark: mark(u), only: templates.size === 1 });
      }
    }
  }
  const tplRows = [...tpl].map(([name, t]) => {
    const v = [...t.keys.values()];
    const judged = v.filter((x) => x.mark);
    const hits = judged.filter((x) => x.mark !== "×");
    return `| ${name} | ${t.queries} | ${t.results} | ${t.keys.size} | ${judged.length} | ${judged.filter((x) => x.mark === "◎").length} | ${hits.length} | ${pct(hits.length, judged.length)} | ${hits.filter((x) => x.only).length} |`;
  });
  const lines = [
    "# 試作C: 数値のまとめ（引用もURLも含まない）",
    "",
    `モデル ${model} ／ 設定 ${configVersion} ／ 当たり＝◎（好きが出てくる発言の記事）＋○（発言の記事）`,
    "",
    "## 起点ごと",
    "",
    "| 起点 | 検索 | URL（重複なし） | 判定済み | ◎ | 当たり | 当たりの割合 | 既知の記事が見つかった | 実費（円） |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...seedRows,
    "",
    "## 検索語の型ごと",
    "",
    "「その型だけ」は、ほかの型では見つからなかった当たりの数。",
    "",
    "| 型 | 検索 | 結果 | URL（重複なし） | 判定済み | ◎ | 当たり | 当たりの割合 | その型だけ |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...tplRows,
    "",
    `実費の合計: ${totalYen.toFixed(2)}円（1人あたり ${(totalYen / runs.length).toFixed(2)}円）`,
    `モデルが検索語を変えた回数: ${changed}`,
    `判定の対象: 各検索の上位${top}位まで`,
    (() => {
      const both = Object.entries(drafts).filter(([k]) => marks.has(k));
      const same = both.filter(([k, d]) => marks.get(k) === d.mark).length;
      return `Claude Code の下書きと本人の判定が一致: ${same}/${both.length}（${pct(same, both.length)}）`;
    })(),
    "",
  ];
  writeFileSync(join(dir, "summary.md"), lines.join("\n"));
}
