// Claude Code の PostToolUse フック。編集したファイルに biome check --write を実行する（整形とimportの整理）。
// 失敗しても作業は止めない（検査は pnpm check と Stop フックで行う）。
import { join } from "node:path";
import { REPO_ROOT, runNodeBin } from "../lib/repo.mjs";

const SUPPORTED = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|css)$/;

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let filePath = "";
try {
  const input = JSON.parse(raw);
  filePath = input?.tool_input?.file_path ?? input?.tool_input?.path ?? "";
} catch {
  process.exit(0);
}
if (!filePath || !SUPPORTED.test(filePath)) process.exit(0);

const biome = join(REPO_ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
runNodeBin(
  biome,
  ["check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true", filePath],
  {
    cwd: REPO_ROOT,
    stdio: "ignore",
  },
);
process.exit(0);
