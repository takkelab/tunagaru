// 下書きの判定のための材料づくり。上位 N 位までのURLの本文を取得し、
// 起点の名前と「好き」の手がかりの語を含む段落だけを spike/out/c/snippets.txt に抜き出す。
// Claude Code がこれを読んで drafts.json（キー → { mark, reason }）を書き、本人が review.md で確かめる。
// 本文と抜粋は gitignore 済みのフォルダにだけ置く（ADR 0019）。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getArticle } from "../b-extraction/article.mjs";
import { topUrls } from "./report.mjs";

const CLUES =
  /好き|愛読|影響|おすすめ|オススメ|お気に入り|ハマ|ファン|憧れ|読んで|聴いて|聞いて|ベスト|favorite/iu;
// 本文を取りに行かないもの（動画・SNS。タイトルだけで判断する）
const NO_FETCH = /(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com|instagram\.com|tiktok\.com)$/u;
const MAX_PARAGRAPHS = 8;
const MAX_CHARS = 160;

export async function writeSnippets(dir, runs, seeds, top) {
  const out = [];
  for (const run of runs) {
    const seed = seeds.find((s) => s.id === run.seed.id);
    const names = [seed.name, ...(seed.aliases ?? [])];
    for (const u of topUrls(run, top)) {
      out.push(`## ${run.seed.id}|${u.key}`, "", u.title, u.url, "");
      if (NO_FETCH.test(new URL(u.url).hostname)) {
        out.push("（動画・SNS。本文は取得しない）", "");
        continue;
      }
      let a;
      try {
        a = await getArticle(u.key.replace(/[^\w.-]+/gu, "_"), u.url, dir);
      } catch (e) {
        out.push(`（取得できない: ${e.message}）`, "");
        continue;
      }
      const mentions = names.reduce((n, x) => n + a.body.split(x).length - 1, 0);
      const picked = a.paragraphs
        .filter((p) => names.some((x) => p.includes(x)) || CLUES.test(p))
        .slice(0, MAX_PARAGRAPHS)
        .map((p) => `- ${p.slice(0, MAX_CHARS)}`);
      out.push(`本文 ${a.body.length}字 ／ 名前の出現 ${mentions}回`, "", ...picked, "");
    }
  }
  const path = join(dir, "snippets.txt");
  writeFileSync(path, `${out.join("\n").trimEnd()}\n`);
  return path;
}
