// R14: fixture-provenance.mjs が、未登録のfixture、許可リスト外のホストの cassette、
// 登録されていない本文を入力にした Anthropic の cassette を検出することを確かめる
import { describe, expect, it } from "vitest";
import { makeTree, runScript } from "../../lib/test-helpers.ts";

const TEXT = "これは架空の本文です。\n\n山田太郎は架空の作家で、架空の詩人を好きだと語った。\n";
const wikipediaText = {
  source: "wikipedia",
  url: "https://ja.wikipedia.org/wiki/X",
  revision: 1,
  retrieved: "2026-11-15",
  license: "CC BY-SA 4.0",
};
const cassette = (url: string, body: unknown = null) =>
  JSON.stringify({
    version: 1,
    interactions: [
      {
        request: {
          method: "POST",
          url,
          headers: {},
          body: body === null ? null : JSON.stringify(body),
        },
        response: { status: 200, headers: {}, body: "{}" },
      },
    ],
  });
const anthropicBody = (doc: string) => ({
  model: "claude-haiku-5-5",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: `抽出してください。\n<document>\n${doc}\n</document>` }],
    },
  ],
});
const run = (fixtures: Record<string, string>, files: Record<string, unknown>) =>
  runScript("tools/lint/fixture-provenance.mjs", [
    "--root",
    makeTree({
      ...Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [`test/fixtures/${k}`, v])),
      "test/fixtures/PROVENANCE.json": JSON.stringify({ version: 1, files }),
    }),
  ]);

describe("fixture-provenance", () => {
  it("登録済みのfixtureと、登録済みの本文を入力にした Anthropic の cassette は通す", () => {
    const r = run(
      {
        "texts/x.txt": TEXT,
        "cassettes/extract.json": cassette(
          "https://api.anthropic.com/v1/messages",
          anthropicBody(TEXT),
        ),
        "cassettes/wiki.json": cassette("https://ja.wikipedia.org/w/api.php"),
      },
      {
        "texts/x.txt": wikipediaText,
        "cassettes/extract.json": {
          source: "synthetic",
          note: "架空の本文で録画",
          input: "texts/x.txt",
        },
        "cassettes/wiki.json": wikipediaText,
      },
    );
    expect(r.output).toBe("\n");
    expect(r.status).toBe(0);
  });

  it("未登録のfixtureを検出する", () => {
    const r = run({ "texts/unknown.txt": TEXT }, {});
    expect(r.status).toBe(1);
    expect(r.output).toContain(
      "test/fixtures/texts/unknown.txt: PROVENANCE.json に登録されていません",
    );
  });

  it("許可されていない出どころを検出する", () => {
    const r = run(
      { "texts/x.txt": TEXT },
      { "texts/x.txt": { source: "interview", url: "https://news.example.jp" } },
    );
    expect(r.status).toBe(1);
    expect(r.output).toContain('出どころ "interview" は使えません');
  });

  it("許可リストにないホストの cassette を検出する", () => {
    const r = run(
      { "cassettes/news.json": cassette("https://news.example.co.jp/interview/1") },
      { "cassettes/news.json": wikipediaText },
    );
    expect(r.status).toBe(1);
    expect(r.output).toContain("ホスト news.example.co.jp は録画の許可リストにありません");
  });

  it("登録されていない本文を入力にした Anthropic の cassette を検出する", () => {
    const r = run(
      {
        "cassettes/extract.json": cassette(
          "https://api.anthropic.com/v1/messages",
          anthropicBody(TEXT),
        ),
      },
      { "cassettes/extract.json": { source: "synthetic", note: "架空" } },
    );
    expect(r.status).toBe(1);
    expect(r.output).toContain(
      '登録済みの Wikipedia か synthetic の本文を "input" に指定してください',
    );
  });

  it("入力本文と一致しない本文を送った Anthropic の cassette を検出する", () => {
    const r = run(
      {
        "texts/x.txt": TEXT,
        "cassettes/extract.json": cassette(
          "https://api.anthropic.com/v1/messages",
          anthropicBody("インタビュー記事の本文がここに入ってしまった。"),
        ),
      },
      {
        "texts/x.txt": wikipediaText,
        "cassettes/extract.json": { source: "synthetic", note: "架空", input: "texts/x.txt" },
      },
    );
    expect(r.status).toBe(1);
    expect(r.output).toContain("入力本文 texts/x.txt と一致しません");
  });
});
