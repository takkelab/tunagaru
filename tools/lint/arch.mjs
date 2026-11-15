// 層の境界の検査（R1〜R7）。dependency-cruiser は違反の件数を終了コードにするので、0/1 にそろえる。
// 使い方: node tools/lint/arch.mjs [--root <dir>]
import { join } from "node:path";
import { REPO_ROOT, rootFromArgs, runNodeBin } from "../lib/repo.mjs";

const root = rootFromArgs();
const bin = join(REPO_ROOT, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");
const config = join(REPO_ROOT, ".dependency-cruiser.cjs");
const result = runNodeBin(bin, ["src", "--config", config, "--output-type", "err-long"], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) {
  console.error(
    "\n層の境界の違反があります。上の説明に従って直してください（docs/spec/architecture.md#層と依存の向き）。",
  );
  process.exit(1);
}
