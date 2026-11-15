// R9: file-length.mjs が301行を検出し、300行は通すことを確かめる
import { describe, expect, it } from "vitest";
import { linesOf, makeTree, runScript } from "../../lib/test-helpers.ts";

const run = (files: Record<string, string>) =>
  runScript("tools/lint/file-length.mjs", ["--root", makeTree(files)]);

describe("file-length", () => {
  it("301行のファイルを検出する", () => {
    const r = run({ "src/domain/long.ts": linesOf(301) });
    expect(r.status).toBe(1);
    expect(r.output).toContain("src/domain/long.ts が 301 行");
  });

  it("300行のファイルは通す", () => {
    expect(run({ "src/domain/ok.ts": linesOf(300) }).status).toBe(0);
  });

  it("テストとfixtureは対象外", () => {
    const r = run({
      "src/domain/long.test.ts": linesOf(400),
      "tools/lint/__tests__/x.ts": linesOf(400),
      "test/fixtures/x.ts": linesOf(400),
    });
    expect(r.status).toBe(0);
  });
});
