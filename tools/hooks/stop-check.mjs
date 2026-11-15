// Claude Code の Stop フック。pnpm check が通らなければ、終了コード2で作業を続けさせる。
// 同じ失敗で2回止めたあと、3回目は止めずに incident を書くよう指示する（無限ループの防止）。
// docs/spec/process.md#機械による止め方
//
// テスト用の環境変数:
//   STOP_CHECK_CMD   実行するコマンド（既定: pnpm check）
//   STOP_CHECK_STATE 状態ファイルのパス（既定: node_modules/.cache/tunagaru/stop-check.json）
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "../lib/repo.mjs";

export const MAX_BLOCKS = 2;
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const INCIDENT_DOC = "docs/spec/process.md#詰まったときの再発防止";
const command = process.env.STOP_CHECK_CMD ?? "pnpm check";
const statePath =
  process.env.STOP_CHECK_STATE ??
  join(REPO_ROOT, "node_modules", ".cache", "tunagaru", "stop-check.json");

const result = spawnSync(command, {
  cwd: REPO_ROOT,
  shell: true,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

if (result.status === 0) {
  if (existsSync(statePath)) rmSync(statePath);
  process.exit(0);
}

const summary = summarize(output);
const signature = createHash("sha256").update(normalize(summary)).digest("hex").slice(0, 16);
const state = readState();
const count = state.signature === signature ? state.count + 1 : 1;
writeState({ signature, count });

if (count > MAX_BLOCKS) {
  // 3回目: 止めるのをやめる。本人にも見えるように systemMessage で知らせる
  const message = `pnpm check が同じ理由で ${count} 回失敗しました。これ以上は止めません。${INCIDENT_DOC} に従い、docs/process/incidents/ に記録して、本人に報告してください。`;
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
  process.stderr.write(`${message}\n\n${summary}\n`);
  process.exit(0);
}

const warning =
  count === MAX_BLOCKS
    ? `\n同じ失敗はこれで ${count} 回目です。次も同じなら止めません。直せない場合は ${INCIDENT_DOC} に従って docs/process/incidents/ に記録してください。`
    : "";
process.stderr.write(
  `pnpm check が失敗しました。直してから終えてください。${warning}\n\n${summary}\n`,
);
process.exit(2);

/** 失敗の要約（エラーらしい行を中心に、最大60行） */
function summarize(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const important = lines.filter((l) => /(error|fail|×|✗|✘|R\d+:|ELIFECYCLE|violation)/i.test(l));
  const picked = (important.length > 0 ? important : lines).slice(-60);
  return picked.join("\n");
}

/** 時間・行番号・パスの区切りなど、毎回変わる部分を取り除いて、同じ失敗かを判定する */
function normalize(text) {
  return text
    .replace(ANSI_COLOR, "")
    .replace(/\d+(\.\d+)?\s*(ms|s)\b/g, "")
    .replace(/\d+/g, "N")
    .replace(/\\/g, "/");
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { signature: "", count: 0 };
  }
}

function writeState(next) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(next)}\n`);
}
