// pnpm test の入口。パスで絞らない実行（全体）だけ、カバレッジの閾値をかける。
// パスで絞った実行（pnpm test src/domain など）では、対象外のファイルで閾値に落ちないようにカバレッジを切る。
import { join } from "node:path";
import { REPO_ROOT, runNodeBin } from "../lib/repo.mjs";

const args = process.argv.slice(2);
const filtered = args.some((a) => !a.startsWith("-"));
const vitest = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
const result = runNodeBin(vitest, ["run", ...(filtered ? [] : ["--coverage"]), ...args], {
  cwd: REPO_ROOT,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
