// R14: test/fixtures/ のすべてのファイルの出どころを PROVENANCE.json で検査する（ADR 0019）
// 使い方: node tools/lint/fixture-provenance.mjs [--root <dir>]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rootFromArgs, toPosix, walk } from "../lib/repo.mjs";
import { ALLOWED_HOSTS, SYNTHETIC_HOSTS } from "./hosts.mjs";

const DOC = "docs/spec/testing.md#fixtureの出どころ";
const SOURCES = ["wikipedia", "wikidata", "musicbrainz", "synthetic"];
const REQUIRED = {
  wikipedia: ["url", "revision", "retrieved", "license"],
  wikidata: ["url", "retrieved", "license"],
  musicbrainz: ["url", "retrieved", "license"],
  synthetic: ["note"],
};

const root = rootFromArgs();
const fixturesDir = join(root, "test", "fixtures");
const registryPath = join(fixturesDir, "PROVENANCE.json");
const errors = [];
const err = (m) => errors.push(m);

/** @type {Record<string, Record<string, unknown>>} */
let registry = {};
if (existsSync(registryPath)) {
  try {
    registry = JSON.parse(readFileSync(registryPath, "utf8")).files ?? {};
  } catch {
    err("test/fixtures/PROVENANCE.json が JSON として読めません。");
  }
} else {
  err("test/fixtures/PROVENANCE.json がありません。");
}

const files = walk(fixturesDir, new Set(["local", "node_modules"]))
  .map((f) => toPosix(fixturesDir, f))
  .filter((rel) => rel !== "PROVENANCE.json" && !rel.endsWith(".gitkeep"));

for (const rel of files) {
  const entry = registry[rel];
  if (!entry) {
    err(
      `test/fixtures/${rel}: PROVENANCE.json に登録されていません。出どころ（${SOURCES.join("／")}）を登録してください。`,
    );
    continue;
  }
  const source = String(entry.source);
  if (!SOURCES.includes(source)) {
    err(
      `test/fixtures/${rel}: 出どころ "${source}" は使えません。コミットしてよいのは ${SOURCES.join("／")} だけです。`,
    );
    continue;
  }
  for (const key of REQUIRED[source] ?? []) {
    if (entry[key] === undefined || entry[key] === "") {
      err(`test/fixtures/${rel}: ${source} には "${key}" の記録が必要です。`);
    }
  }
  if (rel.startsWith("cassettes/") && rel.endsWith(".json")) checkCassette(rel, entry, source);
}
for (const rel of Object.keys(registry)) {
  if (!files.includes(rel)) {
    err(
      `test/fixtures/${rel}: PROVENANCE.json に登録されていますが、ファイルがありません。登録を消してください。`,
    );
  }
}

function checkCassette(rel, entry, source) {
  let cassette;
  try {
    cassette = JSON.parse(readFileSync(join(fixturesDir, rel), "utf8"));
  } catch {
    err(`test/fixtures/${rel}: JSON として読めません。`);
    return;
  }
  for (const [i, it] of (cassette.interactions ?? []).entries()) {
    let host = "";
    try {
      host = new URL(it?.request?.url).hostname;
    } catch {
      err(`test/fixtures/${rel} interactions[${i}]: URL が不正です。`);
      continue;
    }
    const allowed =
      ALLOWED_HOSTS.some((re) => re.test(host)) ||
      (source === "synthetic" && SYNTHETIC_HOSTS.some((re) => re.test(host)));
    if (!allowed) {
      err(
        `test/fixtures/${rel} interactions[${i}]: ホスト ${host} は録画の許可リストにありません。実サイトの応答は test/fixtures/local/ にだけ保存できます（pnpm cassette:record --local）。`,
      );
    }
    if (host === "api.anthropic.com") checkAnthropicInput(rel, i, entry, it?.request?.body);
  }
}

/** Anthropic に送った本文（<document> の中身）が、登録済みの Wikipedia か synthetic の本文に含まれることを確かめる */
function checkAnthropicInput(rel, i, entry, body) {
  const where = `test/fixtures/${rel} interactions[${i}]`;
  const input = typeof entry.input === "string" ? entry.input : "";
  const inputEntry = registry[input];
  const usable =
    inputEntry !== undefined &&
    ["wikipedia", "synthetic"].includes(String(inputEntry.source)) &&
    existsSync(join(fixturesDir, input));
  if (!usable) {
    err(
      `${where}: Anthropic の cassette には、登録済みの Wikipedia か synthetic の本文を "input" に指定してください。`,
    );
    return;
  }
  const source = normalize(readFileSync(join(fixturesDir, input), "utf8"));
  const docs = documentsIn(body);
  if (docs.length === 0) {
    err(
      `${where}: リクエストに <document>…</document> がありません。本文は <document> で囲んで送ってください。`,
    );
    return;
  }
  for (const doc of docs) {
    for (const para of doc
      .split(/\n\s*\n/)
      .map(normalize)
      .filter(Boolean)) {
      if (!source.includes(para)) {
        err(
          `${where}: <document> の本文が、入力本文 ${input} と一致しません（「${para.slice(0, 30)}…」）。`,
        );
        return;
      }
    }
  }
}

/** リクエスト本文（JSON か文字列）の中の文字列をすべて集め、<document> の中身を取り出す */
function documentsIn(body) {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
  }
  const strings = [];
  const visit = (v) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(parsed);
  return strings.flatMap((s) =>
    [...s.matchAll(/<document>([\s\S]*?)<\/document>/g)].map((m) => m[1] ?? ""),
  );
}

function normalize(s) {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

for (const e of errors) console.error(`R14: ${e}`);
if (errors.length > 0) {
  console.error(`\nfixture の出どころに問題があります（${DOC}）。`);
  process.exit(1);
}
