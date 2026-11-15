// tools/ のスクリプトが共通で使う小さなヘルパー
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** `--root <dir>` を受け取る（テストで違反fixtureのディレクトリを渡すため）。既定はリポジトリのルート */
export function rootFromArgs(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--root");
  return i >= 0 && argv[i + 1] ? argv[i + 1] : REPO_ROOT;
}

/** パスを `/` 区切りの相対パスにする */
export function toPosix(root, file) {
  return relative(root, file).split(sep).join("/");
}

/** ディレクトリを再帰的に列挙する。skip に一致したディレクトリ名には入らない */
export function walk(dir, skip = new Set(["node_modules", ".git"])) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!skip.has(name)) out.push(...walk(full, skip));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Node で bin を実行する（Windows で .cmd を経由しないため） */
export function runNodeBin(binPath, args, options = {}) {
  return spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8", ...options });
}
