// R12: cassette に APIキーや Authorization ヘッダーが含まれていないことを検査する
// 使い方: node tools/lint/cassette-secrets.mjs [--root <dir>]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rootFromArgs, toPosix, walk } from "../lib/repo.mjs";

const DOC = "docs/spec/testing.md#録画再生cassette";
const SECRET_HEADERS = [
  "x-api-key",
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "anthropic-api-key",
  "x-goog-api-key",
  "x-auth-token",
];
const SECRET_QUERY = /^(key|api[-_]?key|access[-_]?token|token|auth|secret|client[-_]?secret)$/i;
const SECRET_VALUE = [
  /sk-ant-[A-Za-z0-9_-]{8,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
];

/** @returns {string[]} */
function inspectInteraction(interaction, where) {
  const problems = [];
  for (const side of ["request", "response"]) {
    const headers = interaction?.[side]?.headers ?? {};
    for (const name of Object.keys(headers)) {
      if (SECRET_HEADERS.includes(name.toLowerCase())) {
        problems.push(
          `${where} ${side} のヘッダー ${name} が残っています。録画時に除去してください（tools/cassette の redact）。`,
        );
      }
    }
  }
  const url = interaction?.request?.url;
  if (typeof url === "string") {
    try {
      for (const key of new URL(url).searchParams.keys()) {
        if (SECRET_QUERY.test(key)) {
          problems.push(`${where} URL のクエリ ${key} が残っています。録画時に除去してください。`);
        }
      }
    } catch {
      problems.push(`${where} URL が不正です: ${url}`);
    }
  }
  return problems;
}

const root = rootFromArgs();
const files = walk(join(root, "test", "fixtures", "cassettes")).filter((f) => f.endsWith(".json"));
const errors = [];
for (const file of files) {
  const rel = toPosix(root, file);
  const text = readFileSync(file, "utf8");
  for (const re of SECRET_VALUE) {
    if (re.test(text))
      errors.push(`${rel}: 秘密情報らしき文字列（/${re.source.slice(0, 10)}…/）が含まれています。`);
  }
  let cassette;
  try {
    cassette = JSON.parse(text);
  } catch {
    errors.push(`${rel}: JSON として読めません。`);
    continue;
  }
  const interactions = Array.isArray(cassette?.interactions) ? cassette.interactions : [];
  interactions.forEach((it, i) => {
    errors.push(...inspectInteraction(it, `${rel} interactions[${i}]`));
  });
}
for (const e of errors) console.error(`R12: ${e}`);
if (errors.length > 0) {
  console.error(
    `\ncassette に秘密情報が残っています。本物のキーなら先に無効化・再発行し、録画し直してください（${DOC}）。`,
  );
  process.exit(1);
}
