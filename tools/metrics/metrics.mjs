// pnpm metrics — 手元で計算できる指標を metrics/latest.json に書き、表にして出す（docs/spec/metrics.md#出力）
// カバレッジは直前の pnpm test（coverage/coverage-summary.json）の結果を使う。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, runNodeBin, toPosix, walk } from "../lib/repo.mjs";

const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const EXCLUDED = [/\.test\./, /\.spec\./, /(^|\/)__tests__\//, /(^|\/)fixtures\//, /\.d\.m?ts$/];

function coverage() {
  const path = join(REPO_ROOT, "coverage", "coverage-summary.json");
  if (!existsSync(path)) return null;
  const summary = JSON.parse(readFileSync(path, "utf8"));
  let covered = 0;
  let total = 0;
  for (const [file, v] of Object.entries(summary)) {
    if (file === "total" || !toPosix(REPO_ROOT, file).startsWith("src/domain/")) continue;
    covered += v.lines.covered;
    total += v.lines.total;
  }
  return {
    linesAll: summary.total.lines.pct,
    linesDomain: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100,
  };
}

function longestFiles(limit = 5) {
  return ["src", "tools", "test"]
    .flatMap((d) => walk(join(REPO_ROOT, d)))
    .map((f) => ({ file: toPosix(REPO_ROOT, f), path: f }))
    .filter(({ file }) => CODE.test(file) && !EXCLUDED.some((re) => re.test(file)))
    .map(({ file, path }) => ({ file, lines: readFileSync(path, "utf8").split(/\r?\n/).length }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, limit);
}

function dependencyViolations() {
  const bin = join(
    REPO_ROOT,
    "node_modules",
    "dependency-cruiser",
    "bin",
    "dependency-cruiser.mjs",
  );
  const r = runNodeBin(
    bin,
    ["src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
    {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  try {
    return JSON.parse(r.stdout).summary.violations.length;
  } catch {
    return null;
  }
}

function agentsNotes() {
  return walk(join(REPO_ROOT, "src"))
    .concat([join(REPO_ROOT, "AGENTS.md")])
    .filter((f) => f.endsWith("AGENTS.md") && existsSync(f))
    .reduce(
      (n, f) =>
        n +
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .filter((l) => /^\s*-\s/.test(l)).length,
      0,
    );
}

const cov = coverage();
const metrics = {
  coverage: cov,
  longestFiles: longestFiles(),
  dependencyViolations: dependencyViolations(),
  agentsMdBullets: agentsNotes(),
  cost: null,
  eval: null,
};
mkdirSync(join(REPO_ROOT, "metrics"), { recursive: true });
writeFileSync(join(REPO_ROOT, "metrics", "latest.json"), `${JSON.stringify(metrics, null, 2)}\n`);

const fmt = (v, unit = "") => (v === null || v === undefined ? "未計測" : `${v}${unit}`);
const rows = [
  ["行カバレッジ（全体、web除く）", fmt(cov?.linesAll, "%"), "70%以上"],
  ["行カバレッジ（src/domain）", fmt(cov?.linesDomain, "%"), "90%以上"],
  ["依存ルールの違反", fmt(metrics.dependencyViolations, " 件"), "0件"],
  [
    "最長のファイル",
    metrics.longestFiles[0]
      ? `${metrics.longestFiles[0].file}（${metrics.longestFiles[0].lines} 行）`
      : "-",
    "300行以下",
  ],
  ["AGENTS.md の箇条書き", `${metrics.agentsMdBullets} 件`, "増えたら lint・テスト化を検討"],
  ["当月の費用", "未計測（ステップ5）", "500円以下"],
  ["最新の評価", "未計測（ステップ9）", "適合率は基準値 −3pt まで"],
];
console.log("| 指標 | 値 | 目安 |\n|---|---|---|");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
if (!cov) console.log("\n※ カバレッジは pnpm test を実行したあとに表示されます。");
