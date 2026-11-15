// R15: pnpm secrets と同じ設定（.gitleaks.toml）の gitleaks が、実行時に作った偽のAPIキーを検出することを確かめる
import { describe, expect, it } from "vitest";
import { makeTree, randomAlnum, runScript } from "../../lib/test-helpers.ts";

const scan = (files: Record<string, string>) =>
  runScript("tools/secrets/gitleaks.mjs", [
    "dir",
    makeTree(files),
    "--config",
    ".gitleaks.toml",
    "--no-banner",
  ]);

describe("gitleaks", () => {
  it("偽の Anthropic APIキーを含むファイルを検出する", () => {
    // 形式だけ本物と同じ、ランダムな偽のキー（リポジトリには置かない）
    const fake = `sk-ant-api03-${randomAlnum(93)}AA`;
    const r = scan({ "config.ts": `export const key = "${fake}";\n` });
    expect(r.status).toBe(1);
    expect(r.output).toContain("leaks found");
  });

  it("秘密情報がなければ終了コード0", () => {
    const r = scan({ "config.ts": 'export const key = process.env.ANTHROPIC_API_KEY ?? "";\n' });
    expect(r.status).toBe(0);
  });
});
