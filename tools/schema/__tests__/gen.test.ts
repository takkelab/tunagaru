// R11: gen.mjs --check が、生成物を書き換えたfixtureでずれを検出することを確かめる
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTree, runScript } from "../../lib/test-helpers.ts";

const contract = join(import.meta.dirname, "fixtures", "contract.ts");
function setup() {
  const out = makeTree({});
  const gen = (...extra: string[]) =>
    runScript("tools/schema/gen.mjs", ["--contract", contract, "--out", out, ...extra]);
  expect(gen().status).toBe(0);
  return { out, gen };
}

describe("gen:schema", () => {
  it("contract から JSON Schema を生成する", () => {
    const { out } = setup();
    expect(JSON.parse(readFileSync(join(out, "health-response.json"), "utf8"))).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { ok: { type: "boolean", const: true } },
      required: ["ok"],
      additionalProperties: false,
    });
  });

  it("生成直後の --check は通る", () => {
    expect(setup().gen("--check").status).toBe(0);
  });

  it("生成物を書き換えると --check がずれを検出する", () => {
    const { out, gen } = setup();
    writeFileSync(join(out, "health-response.json"), '{"type":"object"}\n');
    const r = gen("--check");
    expect(r.status).toBe(1);
    expect(r.output).toContain("schema/health-response.json が contract とずれています");
  });

  it("生成物がない・余分なファイルがあると --check が検出する", () => {
    const { out, gen } = setup();
    rmSync(join(out, "health-response.json"));
    writeFileSync(join(out, "old.json"), "{}\n");
    const r = gen("--check");
    expect(r.status).toBe(1);
    expect(r.output).toContain("schema/health-response.json がありません");
    expect(r.output).toContain("schema/old.json に対応するスキーマが contract にありません");
  });
});
