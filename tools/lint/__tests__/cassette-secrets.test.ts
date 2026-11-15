// R12: cassette-secrets.mjs が、秘密情報を含む cassette を検出することを確かめる。偽のキーは実行時に作る
import { describe, expect, it } from "vitest";
import { makeTree, randomAlnum, runScript } from "../../lib/test-helpers.ts";

const cassette = (
  headers: Record<string, string>,
  url = "https://ja.wikipedia.org/w/api.php?action=query",
) =>
  JSON.stringify({
    version: 1,
    interactions: [
      {
        request: { method: "GET", url, headers, body: null },
        response: { status: 200, headers: { "content-type": "application/json" }, body: "{}" },
      },
    ],
  });
const run = (body: string) =>
  runScript("tools/lint/cassette-secrets.mjs", [
    "--root",
    makeTree({ "test/fixtures/cassettes/x.json": body }),
  ]);

describe("cassette-secrets", () => {
  it("x-api-key を含む cassette を検出する", () => {
    const r = run(cassette({ "x-api-key": randomAlnum(40) }));
    expect(r.status).toBe(1);
    expect(r.output).toContain("request のヘッダー x-api-key が残っています");
  });

  it("Authorization ヘッダーを検出する", () => {
    const r = run(cassette({ Authorization: `Bearer ${randomAlnum(32)}` }));
    expect(r.status).toBe(1);
    expect(r.output).toContain("ヘッダー Authorization");
  });

  it("URL のクエリに残ったキーを検出する", () => {
    const r = run(cassette({}, `https://ja.wikipedia.org/w/api.php?api_key=${randomAlnum(20)}`));
    expect(r.status).toBe(1);
    expect(r.output).toContain("URL のクエリ api_key");
  });

  it("秘密情報がなければ終了コード0", () => {
    expect(run(cassette({ "user-agent": "tunagaru-test" })).status).toBe(0);
  });
});
