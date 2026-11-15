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

async function getJson(url, retry = true) {
  const res = await fetch(url, {
    headers: { "user-agent": "tunagaru-spike/0.1 (local prototype)" },
  });
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 3000));
    return getJson(url, false);
  }
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

// 人の写真: Wikidata で名前を検索し、人物（Q5）か音楽グループの項目のうち、
// 検索順で最初のものの肖像（P18）を使う。名前が見出しと一致したものだけを候補にする。画像は Wikimedia Commons から縮小して表示する
const PERSON_OR_GROUP = new Set(["Q5", "Q215380", "Q5741069", "Q2088357", "Q105543609"]);
const WD = "https://www.wikidata.org/w/api.php?format=json&origin=*";
async function wikidataPortrait(name) {
  const search = await getJson(
    `${WD}&action=wbsearchentities&language=ja&uselang=ja&type=item&limit=7&search=${encodeURIComponent(name)}`,
  );
  // 別名で当たっただけの項目は使わない（例: 「MICO」が別名の別人）。無理そうなら画像なしにする
  const ids = (search.search ?? []).filter((r) => r.match?.type === "label").map((r) => r.id);
  if (!ids.length) return null;
  const ents = (await getJson(`${WD}&action=wbgetentities&props=claims&ids=${ids.join("|")}`))
    .entities;
  for (const id of ids) {
    const claims = ents[id]?.claims ?? {};
    const types = (claims.P31 ?? []).map((c) => c.mainsnak?.datavalue?.value?.id);
    if (!types.some((t) => PERSON_OR_GROUP.has(t))) continue;
    const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    return {
      qid: id,
      url: file
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=320`
        : null,
    };
  }
  return null;
}

// Wikidata には1件ずつ、間を空けて問い合わせる（並行すると 429 になる）
let wdQueue = Promise.resolve();
function queued(fn) {
  const run = wdQueue.then(fn);
  wdQueue = run.catch(() => null).then(() => new Promise((r) => setTimeout(r, 1200)));
  return run;
}
async function portrait(params) {
  const names = [params.get("name") ?? "", ...params.getAll("alt")].filter(Boolean);
  const key = `portrait|${names[0]}`;
  if (!(key in cache)) {
    try {
      let found = null;
      for (const n of names) {
        found = await queued(() => wikidataPortrait(n));
        if (found) break;
      }
      cache[key] = found;
    } catch (e) {
      process.stdout.write(`写真の取得に失敗: ${names[0]} ${e.message}\n`);
      return null;
    }
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache, null, 2));
  }
  return cache[key];
}

// 作品集: iTunes Search で作り手の電子書籍かアルバムを集める。
// 作り手の名前（別名を含む）が artistName に入っているものだけを残し、題名で重複を除く
async function works(params) {
  const domain = params.get("domain");
  const names = [params.get("name") ?? "", ...params.getAll("alt")].filter(Boolean);
  const key = `works|${domain}|${names[0]}`;
  if (key in cache) return cache[key];
  const media =
    domain === "music" ? "media=music&entity=album&attribute=artistTerm" : "media=ebook";
  const out = new Map();
  try {
    for (const n of names) {
      const url = `https://itunes.apple.com/search?country=JP&limit=50&${media}&term=${encodeURIComponent(n)}`;
      const results = (await queued(() => getJson(url))).results ?? [];
      for (const r of results) {
        const artist = (r.artistName ?? "").replace(/\s/g, "");
        if (!names.some((x) => artist.includes(x.replace(/\s/g, "")))) continue;
        const title = (r.collectionName ?? r.trackName ?? "").replace(/\s*[-–(（].*$/, "").trim();
        if (!title || out.has(title)) continue;
        out.set(title, {
          title,
          img: r.artworkUrl100?.replace("100x100bb", "400x400bb") ?? null,
          year: (r.releaseDate ?? "").slice(0, 4),
        });
      }
      if (out.size >= 12) break;
    }
  } catch (e) {
    process.stdout.write(`作品集の取得に失敗: ${names[0]} ${e.message}\n`);
    return [];
  }
  cache[key] = [...out.values()].slice(0, 24);
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache, null, 2));
  return cache[key];
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/works") {
    const body = JSON.stringify({ works: await works(url.searchParams) });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(body);
    return;
  }
  if (url.pathname === "/portrait") {
    const body = JSON.stringify((await portrait(url.searchParams)) ?? { url: null });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(body);
    return;
  }
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
