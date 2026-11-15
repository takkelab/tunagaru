// R10: docs の検査（相対リンクとアンカー、ADRの連番と一覧）。markdownlint は別に実行する。
// 使い方: node tools/lint/docs.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { rootFromArgs, toPosix, walk } from "../lib/repo.mjs";

const DOC = "docs/spec/architecture.md#lintで強制する設計ルール";
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "coverage",
  "fixtures",
  "test-results",
  "playwright-report",
]);

/** GitHub と同じ規則で見出しからアンカーを作る */
export function slugify(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

/** コードブロックの外の行だけを返す（コードブロックの中は空行にする） */
function outsideFences(text) {
  let inFence = false;
  return text.split(/\r?\n/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
}

/** リンクの検査用。インラインコードも取り除く */
const proseLines = (text) => outsideFences(text).map((l) => l.replace(/`[^`]*`/g, ""));

function anchorsOf(text) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of outsideFences(text)) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m?.[1]) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

const root = rootFromArgs();
const mdFiles = walk(root, SKIP_DIRS).filter((f) => f.endsWith(".md"));
const anchorCache = new Map();
const getAnchors = (file) => {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(readFileSync(file, "utf8")));
  return anchorCache.get(file);
};

const errors = [];
for (const file of mdFiles) {
  const rel = toPosix(root, file);
  proseLines(readFileSync(file, "utf8")).forEach((line, i) => {
    for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const href = m[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const [pathPart = "", hash] = href.split("#");
      const target = pathPart === "" ? file : resolve(dirname(file), decodeURIComponent(pathPart));
      const where = `${rel}:${i + 1}`;
      if (!existsSync(target)) {
        errors.push(
          `${where}: リンク先 ${href} がありません。パスを直すか、リンクを消してください。`,
        );
        continue;
      }
      if (hash !== undefined && statSync(target).isFile() && target.endsWith(".md")) {
        const anchor = decodeURIComponent(hash);
        if (!getAnchors(target).has(anchor)) {
          errors.push(
            `${where}: ${href} の見出し「#${anchor}」がありません。見出しの文言と合わせてください。`,
          );
        }
      }
    }
  });
}

const adrDir = join(root, "docs", "decisions");
if (existsSync(adrDir)) {
  const names = readdirSync(adrDir).filter((n) => n !== "README.md" && n.endsWith(".md"));
  const readmePath = join(adrDir, "README.md");
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  const numbers = [];
  for (const name of names) {
    const m = /^(\d{4})-[a-z0-9-]+\.md$/.exec(name);
    if (!m) {
      errors.push(`docs/decisions/${name}: ファイル名は NNNN-kebab-case-title.md にしてください。`);
      continue;
    }
    numbers.push(Number(m[1]));
    if (!readme.includes(`(${name})`)) {
      errors.push(
        `docs/decisions/${name}: docs/decisions/README.md の一覧に載っていません。一覧の表に行を追加してください。`,
      );
    }
  }
  numbers.sort((a, b) => a - b);
  numbers.forEach((n, i) => {
    if (n !== i + 1) {
      const expected = String(i + 1).padStart(4, "0");
      errors.push(
        `docs/decisions: ADRの番号が飛んでいます（${expected} があるべき位置に ${String(n).padStart(4, "0")}）。連番にしてください。`,
      );
    }
  });
  const uniq = new Set(numbers);
  if (uniq.size !== numbers.length) errors.push("docs/decisions: 同じ番号のADRが複数あります。");
}

for (const e of errors) console.error(`R10: ${e}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} 件の docs の問題があります（${DOC}）。`);
  process.exit(1);
}
