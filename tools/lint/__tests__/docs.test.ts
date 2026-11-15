// R10: docs.mjs が、壊れた相対リンク、一覧にないADR、番号の飛びを検出することを確かめる
import { describe, expect, it } from "vitest";
import { makeTree, runScript } from "../../lib/test-helpers.ts";

const adr = (n: string) => `# ${n} タイトル\n\n- 状態: 採用\n`;
const readme = (names: string[]) =>
  `# 決定記録\n\n| # | タイトル |\n|---|---|\n${names.map((n) => `| [${n.slice(0, 4)}](${n}) | x |`).join("\n")}\n`;

const base = {
  "SPEC.md": "# 仕様\n\n[進め方](docs/spec/process.md#ステップ1-ハーネスの土台step01-harness)\n",
  "docs/spec/process.md": "# 進め方\n\n## ステップ1: ハーネスの土台（`step/01-harness`）\n",
  "docs/decisions/0001-a.md": adr("0001"),
  "docs/decisions/0002-b.md": adr("0002"),
  "docs/decisions/README.md": readme(["0001-a.md", "0002-b.md"]),
};
const run = (files: Record<string, string>) =>
  runScript("tools/lint/docs.mjs", ["--root", makeTree(files)]);

describe("docs", () => {
  it("問題がなければ終了コード0（日本語の見出しのアンカーも解決できる）", () => {
    const r = run(base);
    expect(r.output).toBe("\n");
    expect(r.status).toBe(0);
  });

  it("壊れた相対リンクを検出する", () => {
    const r = run({ ...base, "SPEC.md": "# 仕様\n\n[なし](docs/spec/missing.md)\n" });
    expect(r.status).toBe(1);
    expect(r.output).toContain("SPEC.md:3: リンク先 docs/spec/missing.md がありません");
  });

  it("存在しない見出しへのリンクを検出する", () => {
    const r = run({ ...base, "SPEC.md": "# 仕様\n\n[進め方](docs/spec/process.md#ステップ9)\n" });
    expect(r.status).toBe(1);
    expect(r.output).toContain("見出し「#ステップ9」がありません");
  });

  it("コードブロックの中のリンクは無視する", () => {
    const r = run({ ...base, "SPEC.md": "# 仕様\n\n```markdown\n[なし](missing.md)\n```\n" });
    expect(r.status).toBe(0);
  });

  it("一覧にないADRを検出する", () => {
    const r = run({ ...base, "docs/decisions/0003-c.md": adr("0003") });
    expect(r.status).toBe(1);
    expect(r.output).toContain(
      "docs/decisions/0003-c.md: docs/decisions/README.md の一覧に載っていません",
    );
  });

  it("ADRの番号の飛びを検出する", () => {
    const r = run({
      ...base,
      "docs/decisions/0004-d.md": adr("0004"),
      "docs/decisions/README.md": readme(["0001-a.md", "0002-b.md", "0004-d.md"]),
    });
    expect(r.status).toBe(1);
    expect(r.output).toContain("ADRの番号が飛んでいます（0003 があるべき位置に 0004）");
  });
});
