import { describe, expect, it } from "vitest";
import { makeTree } from "../lib/test-helpers.ts";
import {
  assertRecordable,
  type Cassette,
  createReplayFetch,
  type Interaction,
  loadCassette,
  redact,
} from "./cassette.ts";

const interaction: Interaction = {
  request: {
    method: "GET",
    url: "https://ja.wikipedia.org/w/api.php?action=query",
    headers: {},
    body: null,
  },
  response: { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' },
};
const cassette: Cassette = { version: 1, interactions: [interaction] };

describe("loadCassette", () => {
  it("cassette がなければ「cassetteがありません」で失敗する", () => {
    expect(() => loadCassette("missing", { root: makeTree({}) })).toThrow("cassetteがありません");
  });

  it("cassette を読む", () => {
    const root = makeTree({ "test/fixtures/cassettes/wiki.json": JSON.stringify(cassette) });
    expect(loadCassette("wiki", { root })).toEqual(cassette);
  });
});

describe("createReplayFetch", () => {
  it("一致するリクエストに録画した応答を返す", async () => {
    const res = await createReplayFetch(cassette)(
      "https://ja.wikipedia.org/w/api.php?action=query",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("一致しないリクエストは失敗する（実APIを呼ばない）", async () => {
    await expect(createReplayFetch(cassette)("https://ja.wikipedia.org/wiki/X")).rejects.toThrow(
      "cassetteに一致するリクエストがありません",
    );
  });

  it("同じ録画は一度しか使えない", async () => {
    const replay = createReplayFetch(cassette);
    await replay(interaction.request.url);
    await expect(replay(interaction.request.url)).rejects.toThrow(
      "cassetteに一致するリクエストがありません",
    );
  });
});

describe("redact", () => {
  it("秘密情報のヘッダーとクエリを除去する", () => {
    const dirty: Interaction = {
      request: {
        method: "POST",
        url: "https://api.anthropic.com/v1/messages?key=abc&beta=true",
        headers: {
          "x-api-key": "dummy",
          Authorization: "dummy",
          "content-type": "application/json",
        },
        body: "{}",
      },
      response: { status: 200, headers: { "set-cookie": "dummy", "request-id": "r1" }, body: "{}" },
    };
    expect(redact(dirty)).toEqual({
      request: {
        method: "POST",
        url: "https://api.anthropic.com/v1/messages?beta=true",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      response: { status: 200, headers: { "request-id": "r1" }, body: "{}" },
    });
  });
});

describe("assertRecordable", () => {
  it.each([
    "https://ja.wikipedia.org/wiki/X",
    "https://query.wikidata.org/sparql",
    "https://musicbrainz.org/ws/2/artist",
  ])("許可リストのホスト %s は録画できる", (url) => {
    expect(() => assertRecordable(url)).not.toThrow();
  });

  it("許可リストにないホストは拒否する", () => {
    expect(() => assertRecordable("https://news.example.co.jp/interview")).toThrow(
      "許可リストにありません",
    );
  });

  it("--local なら許可リストにないホストも録画できる", () => {
    expect(() =>
      assertRecordable("https://news.example.co.jp/interview", { local: true }),
    ).not.toThrow();
  });
});
