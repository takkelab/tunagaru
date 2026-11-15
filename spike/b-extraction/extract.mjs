// Haiku での抽出（構造化出力）。プロンプトの内容ハッシュを prompt_version にする。
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const MODEL = "claude-haiku-5-5";
// 100万トークンあたりの米ドル（2026-11 時点。プロンプトが10万トークンを超えると5倍）
export const PRICE = { input: 0.1, output: 0.5 };
// 見積もりは高めに置く
export const YEN_PER_USD = 160;

export const POLARITIES = ["likes", "influenced_by", "past_like", "dislikes", "denies_influence"];

const Statement = z.object({
  subject_name: z.string(),
  object_name: z.string(),
  polarity: z.enum(POLARITIES),
  attribution: z.enum(["self", "third_party"]),
  quote: z.string(),
  work_title: z.string().nullable(),
  translation: z.string().nullable(),
});
export const Output = z.object({ statements: z.array(Statement) });

export const SYSTEM = `あなたは、インタビュー記事や動画の文字起こしから、人が「好きな作り手・作品」を語った発言を抜き出す係です。

抜き出すもの:
- ある人（主体）が、作り手（作家、音楽家、バンド、映画監督、俳優、芸人、思想家など）や、その作品について、好き・影響を受けた・昔は好きだった・苦手・影響を否定する、と述べている箇所。
- 主体は、記事の取材対象に限らず、本文で語っている人なら誰でもよい。

各項目の書き方:
- subject_name: 語っている人の名前。文字起こしには話者の表示がないので、文脈から判断する。
- object_name: 好きだと語られた作り手の名前。作品だけが語られているときは、その作品の作り手の名前を入れる（わからなければ作品名を入れる）。
- work_title: 作品が挙がっていれば、その題名。なければ null。
- polarity: likes（好き・愛読・ファン）／influenced_by（影響を受けた）／past_like（昔は好きだった）／dislikes（嫌い・苦手）／denies_influence（影響を否定している）。
- attribution: self（本人が自分の言葉で語っている）／third_party（記者の地の文やナレーションなど、他人がその人について書いている）。
- quote: 本文から、そのまま写した部分。1〜2文、200字以内。作り手の名前か作品名を必ず含む範囲にする。誤字や変換ミスがあっても直さずに写す。言い換えや要約はしない。
- translation: quote が日本語以外なら、日本語訳。日本語なら null。

注意:
- 同じ人・同じ相手でも、作品が違えば別の項目にする。
- 作り手でないもの（ジャンル、食べ物、場所、一般名詞）は抜き出さない。
- 該当する発言がなければ、statements を空にする。`;

export const promptVersion = createHash("sha256").update(SYSTEM).digest("hex").slice(0, 12);

export function userMessage({ title, kind, seedNames, text }) {
  return [
    `出典: ${title}`,
    `種類: ${kind === "transcript" ? "動画の文字起こし（自動字幕。誤字が多い）" : "記事"}`,
    `取材対象: ${seedNames.join("、")}`,
    "",
    "<本文>",
    text,
    "</本文>",
  ].join("\n");
}

// 実費の見積もり用。日本語は1字≒1トークン、英語は4字≒1トークンとして高めに見る。
export function estimateTokens(text) {
  const ascii = [...text].filter((c) => c.charCodeAt(0) < 0x80).length;
  return Math.ceil(text.length - ascii + ascii / 3);
}

export const yen = ({ input, output }) =>
  ((input * PRICE.input + output * PRICE.output) / 1e6) * YEN_PER_USD;

export async function extract(message) {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: message }],
    output_config: { format: zodOutputFormat(Output) },
  });
  if (res.stop_reason !== "end_turn") throw new Error(`stop_reason=${res.stop_reason}`);
  return {
    statements: res.parsed_output?.statements ?? [],
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
  };
}
