// tools のテスト用ヘルパー。違反を仕込んだfixtureを一時ディレクトリに作り、独自lintを子プロセスで実行する
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** files（相対パス → 内容）を一時ディレクトリに書き、そのパスを返す */
export function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tunagaru-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

export type RunResult = { status: number | null; output: string; stdout: string };

/** リポジトリの node スクリプトを実行する */
export function runScript(
  script: string,
  args: string[] = [],
  options: { cwd?: string; env?: Record<string, string> } = {},
): RunResult {
  const r = spawnSync(process.execPath, [join(REPO_ROOT, script), ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...options.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}`, stdout: r.stdout };
}

/** 英数字のランダムな文字列（偽のキーをテストの実行時に作るため） */
export function randomAlnum(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(length)].map((b) => chars[b % chars.length]).join("");
}

/** n 行のファイルの内容 */
export function linesOf(n: number): string {
  return `${Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join("\n")}\n`;
}
