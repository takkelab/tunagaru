// 起点の「主な作品」を集める（検索語の「作品名 インタビュー」に使う）。
//   worksAs がある人（バンド名などで活動する人）: iTunes Search のアルバムとEPを新しい順に
//   それ以外: Wikidata で、出演（P161）・著者（P50）・演奏（P175）に起点が入っている作品を、サイトリンクの多い順に
// 結果は spike/out/c/works.json にキャッシュする。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = "tunagaru-spike/0.1 (personal, non-commercial)";
export const WORKS_PER_SEED = 3;

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/sparql-results+json, application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function itunesAlbums(artist) {
  const url = `https://itunes.apple.com/search?country=JP&entity=album&limit=50&term=${encodeURIComponent(artist)}`;
  const { results } = await getJson(url);
  const seen = new Set();
  return results
    .filter((r) => r.artistName === artist && !/ - Single$/u.test(r.collectionName))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .map((r) => r.collectionName.replace(/ - EP$/u, ""))
    .filter((t) => !seen.has(t) && seen.add(t))
    .slice(0, WORKS_PER_SEED);
}

async function wikidataWorks(name) {
  const search = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=ja&uselang=ja&limit=1&search=${encodeURIComponent(name)}`,
  );
  const qid = search.search[0]?.id;
  if (!qid) return { qid: null, works: [] };
  const query = `SELECT ?w ?wLabel ?links WHERE {
    VALUES ?p { wdt:P161 wdt:P50 wdt:P175 }
    ?w ?p wd:${qid} . ?w wikibase:sitelinks ?links .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
  } ORDER BY DESC(?links) LIMIT 20`;
  const data = await getJson(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
  );
  const seen = new Set();
  const works = data.results.bindings
    .map((b) => b.wLabel.value)
    .filter((t) => !/^Q\d+$/u.test(t) && !seen.has(t) && seen.add(t))
    .slice(0, WORKS_PER_SEED);
  return { qid, works };
}

export async function seedWorks(seeds, outDir) {
  const file = join(outDir, "works.json");
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  for (const s of seeds) {
    if (cache[s.id]) continue;
    cache[s.id] = s.worksAs?.length
      ? { from: "itunes", works: await itunesAlbums(s.worksAs[0]) }
      : { from: "wikidata", ...(await wikidataWorks(s.name)) };
  }
  writeFileSync(file, JSON.stringify(cache, null, 1));
  return cache;
}
