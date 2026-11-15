// 試作A（体験）の静的ページを 127.0.0.1 で配信する。使い捨て（ADR 0025）
// データは gitignore 済みの spike/data/likes.json を読む。
// 表紙は /cover で iTunes Search から取り、spike/out/covers.json にキャッシュする
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cacheFile = join(here, "..", "out", "covers.json");
const routes = {
  "/": { file: join(here, "index.html"), type: "text/html; charset=utf-8" },
  "/data/likes.json": {
    file: join(here, "..", "data", "likes.json"),
    type: "application/json; charset=utf-8",
  },
};
const port = Number(process.argv[2] ?? 8790);

let cache = {};
try {
  cache = JSON.parse(await readFile(cacheFile, "utf8"));
} catch {
  cache = {};
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "tunagaru-spike/0.1" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// 本と曲: iTunes Search（日本のストア）。本は電子書籍、曲はアルバムのアートワークを使う。
// 見つからなければ「題名だけ」「作り手だけ」で探し直す（作り手だけのときは代表作の表紙になる）
let queue = Promise.resolve();
function itunesCover(domain, title, creator) {
  const run = queue.then(() => itunesCoverNow(domain, title, creator));
  queue = run.catch(() => null);
  return run;
}
async function itunesCoverNow(domain, title, creator) {
  const media = domain === "music" ? "media=music&entity=album" : "media=ebook";
  const terms = title ? [`${title} ${creator}`, title] : [creator];
  for (const term of terms) {
    const url = `https://itunes.apple.com/search?country=JP&limit=1&${media}&term=${encodeURIComponent(term)}`;
    const hit = (await getJson(url)).results?.[0];
    if (hit?.artworkUrl100) return hit.artworkUrl100.replace("100x100bb", "400x400bb");
  }
  return null;
}

async function cover(params) {
  const domain = params.get("domain");
  const title = params.get("title") ?? "";
  const creator = params.get("creator") ?? "";
  const key = `${domain}|${title}|${creator}`;
  if (!(key in cache)) {
    try {
      cache[key] = await itunesCover(domain, title, creator);
    } catch (e) {
      process.stdout.write(`表紙の取得に失敗: ${key} ${e.message}\n`);
      return null;
    }
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache, null, 2));
  }
  return cache[key];
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/cover") {
    const body = JSON.stringify({ url: await cover(url.searchParams) });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(body);
    return;
  }
  const route = routes[url.pathname];
  if (!route) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(route.file);
    res.writeHead(200, { "content-type": route.type, "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end(`${route.file} がありません`);
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`試作A: http://127.0.0.1:${port}/ （止めるときは Ctrl+C）\n`);
});
