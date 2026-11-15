// 検索語の組み立てと、Claude の Web 検索ツール（Haiku 5.5 では動的フィルタなしの基本版）での検索。
// URL はモデルの答えではなく、検索結果のブロック（web_search_tool_result）からそのまま取る。
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-haiku-5-5";
// 2026-11 時点。検索は1,000回あたり$10、トークンは100万あたり（入力$0.10／出力$0.50）
export const PRICE = { search: 10 / 1000, input: 0.1, output: 0.5 };
export const YEN_PER_USD = 160;
// 1回あたりの見積もり（検索結果が入力に入るので、入力は高めに置く）
export const GUESS = { input: 20000, output: 1000 };

// 歌詞・リリース情報・ストアのサイトは、検索の対象から外す（ADR 0025）
export const BLOCKED_DOMAINS = [
  "uta-net.com",
  "j-lyric.net",
  "utaten.com",
  "kget.jp",
  "lyrical-nonsense.com",
  "petitlyrics.com",
  "musixmatch.com",
  "genius.com",
  "open.spotify.com",
  "music.apple.com",
  "music.amazon.co.jp",
  "amazon.co.jp",
  "mora.jp",
  "recochoku.jp",
];

export const SYSTEM =
  "あなたは検索の係です。ユーザーが渡した検索語を、一字も変えずにそのまま web_search で1回だけ検索してください。検索が終わったら「完了」とだけ答えてください。結果の要約や説明は要りません。";

export const configVersion = createHash("sha256")
  .update(JSON.stringify({ MODEL, SYSTEM, BLOCKED_DOMAINS }))
  .digest("hex")
  .slice(0, 12);

/** 起点1人分の検索語。型（template）ごとに数えられるよう、型の名前をつけて返す。 */
export function buildQueries(seed, works) {
  // 短くて別人に当たる名前（例: MICO）は、活動名を添えて区別する
  const who = seed.worksAs?.length ? `${seed.name} ${seed.worksAs[0]}` : seed.name;
  const by = seed.worksAs?.[0] ?? seed.name;
  const q = [{ template: "人名 インタビュー", query: `${who} インタビュー` }];
  for (const a of seed.aliases ?? []) {
    q.push({ template: "別名 インタビュー", query: `${a} インタビュー` });
  }
  for (const w of works) {
    // アルバム名だけでは別の作品に当たるので、作り手の名前を添える
    q.push({
      template: "作品名 インタビュー",
      query: seed.worksAs?.length ? `${w} ${by} インタビュー` : `${w} ${seed.name} インタビュー`,
    });
  }
  q.push(
    { template: "人名 好きな本", query: `${who} 好きな本` },
    { template: "人名 好きな音楽", query: `${who} 好きな音楽` },
    { template: "人名 愛読書", query: `${who} 愛読書` },
    { template: "人名 影響を受けた", query: `${who} 影響を受けた` },
  );
  return q;
}

export const yen = ({ searches, input, output }) =>
  (searches * PRICE.search + (input * PRICE.input + output * PRICE.output) / 1e6) * YEN_PER_USD;

export async function search(query) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low" },
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 1,
        blocked_domains: BLOCKED_DOMAINS,
        user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" },
      },
    ],
    messages: [{ role: "user", content: `検索語: ${query}` }],
  });
  const used = res.content.filter((b) => b.type === "server_tool_use").map((b) => b.input?.query);
  const results = [];
  const errors = [];
  for (const b of res.content) {
    if (b.type !== "web_search_tool_result") continue;
    if (!Array.isArray(b.content)) {
      errors.push(b.content.error_code);
      continue;
    }
    for (const r of b.content) {
      results.push({ url: r.url, title: r.title, page_age: r.page_age ?? null });
    }
  }
  return {
    usedQueries: used,
    results,
    errors,
    stop_reason: res.stop_reason,
    usage: {
      searches: res.usage.server_tool_use?.web_search_requests ?? used.length,
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
    },
  };
}
