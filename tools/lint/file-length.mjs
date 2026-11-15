// R9: 1ファイルは300行まで（テスト・fixture・生成物は除く）
// 使い方: node tools/lint/file-length.mjs [--root <dir>]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rootFromArgs, toPosix, walk } from "../lib/repo.mjs";

export const MAX_LINES = 300;
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const EXCLUDED = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)fixtures\//,
  /\.d\.ts$/,
];

const root = rootFromArgs();
const files = ["src", "tools", "test"].flatMap((d) => walk(join(root, d)));
const violations = [];
for (const file of files) {
  const rel = toPosix(root, file);
  if (!CODE.test(rel) || EXCLUDED.some((re) => re.test(rel))) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.length === 0 ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
  if (lines > MAX_LINES) violations.push({ rel, lines });
}
for (const v of violations) {
  console.error(
    `R9: ${v.rel} が ${v.lines} 行です（上限 ${MAX_LINES} 行）。新しい機能は新しいモジュールに分けて書いてください。docs/spec/architecture.md#lintで強制する設計ルール`,
  );
}
process.exit(violations.length > 0 ? 1 : 0);
