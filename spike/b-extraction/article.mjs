// 記事の取得（robots.txt の確認 → 取得 → Readability で本文を段落に分ける）。
// 本文は spike/out/b/texts/ にキャッシュする（gitignore 済み。ADR 0019）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const UA = "tunagaru-spike/0.1 (personal, non-commercial)";
const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,dd,dt,figcaption,td,th";

async function allowedByRobots(url) {
  const u = new URL(url);
  try {
    const res = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA } });
    if (!res.ok) return true;
    let applies = false;
    for (const raw of (await res.text()).split(/\r?\n/u)) {
      const line = raw.replace(/#.*/u, "").trim();
      const [k, ...rest] = line.split(":");
      const key = k?.toLowerCase();
      const v = rest.join(":").trim();
      if (key === "user-agent") applies = v === "*";
      else if (applies && key === "disallow" && v && u.pathname.startsWith(v)) return false;
    }
  } catch {}
  return true;
}

function decode(buf, contentType) {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
  const charset =
    contentType?.match(/charset=([\w-]+)/iu)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/iu)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

const SKIP = "script,style,noscript,nav,header,footer,aside,form";

/** 末端のブロックと、文字を直接持つ div から段落を作る。<br> は段落の区切りにする。 */
function toParagraphs(root) {
  for (const el of root.querySelectorAll(SKIP)) el.remove();
  for (const br of root.querySelectorAll("br")) br.replaceWith("\n");
  const out = [];
  for (const el of root.querySelectorAll(`${BLOCKS},div`)) {
    const isDiv = el.tagName.toLowerCase() === "div";
    const text = isDiv
      ? [...el.childNodes]
          .filter(
            (n) => n.nodeType === 3 || ["SPAN", "A", "B", "STRONG", "EM", "I"].includes(n.tagName),
          )
          .map((n) => n.textContent)
          .join("")
      : el.querySelector(BLOCKS)
        ? ""
        : el.textContent;
    for (const line of text.split(/\n+/u)) {
      const t = line.replace(/\s+/gu, " ").trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** 返り値: { title, paragraphs, body, fetchedAt }。body は段落を空行でつないだもの。 */
export async function getArticle(id, url, outDir) {
  const dir = join(outDir, "texts");
  mkdirSync(dir, { recursive: true });
  const cache = join(dir, `${id}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  if (!(await allowedByRobots(url))) throw new Error(`robots.txt で禁止: ${url}`);
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "ja,en" } });
  if (!res.ok) throw new Error(`取得に失敗 ${res.status}: ${url}`);
  const html = decode(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type"));
  const { document } = parseHTML(html);
  const parsed = new Readability(document).parse();
  let paragraphs = parsed
    ? toParagraphs(parseHTML(`<html><body>${parsed.content}</body></html>`).document.body)
    : [];
  if (paragraphs.join("").length < 300) paragraphs = toParagraphs(parseHTML(html).document.body);
  const article = {
    title: parsed?.title ?? null,
    paragraphs,
    body: paragraphs.join("\n\n"),
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(cache, JSON.stringify(article, null, 1));
  return article;
}
