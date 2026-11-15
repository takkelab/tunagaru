// 録画再生（cassette）のヘルパーの雛形。adapters のテストから使う（docs/spec/testing.md#録画再生cassette）
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HOSTS, SYNTHETIC_HOSTS } from "../lint/hosts.mjs";

export type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
};
export type RecordedResponse = { status: number; headers: Record<string, string>; body: string };
export type Interaction = { request: RecordedRequest; response: RecordedResponse };
export type Cassette = { version: 1; interactions: Interaction[] };
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const ROOT = join(import.meta.dirname, "..", "..");
export const SECRET_HEADERS = new Set([
  "x-api-key",
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "anthropic-api-key",
  "x-goog-api-key",
  "x-auth-token",
]);
const SECRET_QUERY = /^(key|api[-_]?key|access[-_]?token|token|auth|secret|client[-_]?secret)$/i;

export function cassettePath(
  name: string,
  options: { local?: boolean; root?: string } = {},
): string {
  const base = join(
    options.root ?? ROOT,
    "test",
    "fixtures",
    options.local ? "local" : "cassettes",
  );
  return join(base, `${name}.json`);
}

/** cassette を読む。ないときは「cassetteがありません」で失敗する（勝手に実APIを呼ばない） */
export function loadCassette(name: string, options: { root?: string } = {}): Cassette {
  const path = cassettePath(name, options);
  if (!existsSync(path)) {
    throw new Error(
      `cassetteがありません: ${path}。pnpm cassette:record ${name} で録画してください。`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as Cassette;
}

/** cassette を順に再生する fetch。method・URL・本文が一致しなければ失敗する */
export function createReplayFetch(cassette: Cassette): FetchLike {
  const remaining = [...cassette.interactions];
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = stripSecretQuery(String(input));
    const body = typeof init?.body === "string" ? init.body : null;
    const index = remaining.findIndex(
      (it) =>
        it.request.method.toUpperCase() === method &&
        it.request.url === url &&
        (it.request.body === null || it.request.body === body),
    );
    const found = index >= 0 ? remaining.splice(index, 1)[0] : undefined;
    if (!found) {
      throw new Error(
        `cassetteに一致するリクエストがありません: ${method} ${url}。録画し直してください。`,
      );
    }
    return new Response(found.response.body, {
      status: found.response.status,
      headers: found.response.headers,
    });
  };
}

/** 保存する前に、秘密情報を含むヘッダーとクエリを除去する */
export function redact(interaction: Interaction): Interaction {
  const clean = (headers: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(headers).filter(([k]) => !SECRET_HEADERS.has(k.toLowerCase())),
    );
  return {
    request: {
      ...interaction.request,
      url: stripSecretQuery(interaction.request.url),
      headers: clean(interaction.request.headers),
    },
    response: { ...interaction.response, headers: clean(interaction.response.headers) },
  };
}

function stripSecretQuery(raw: string): string {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (SECRET_QUERY.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/** 録画してよいURLかを確かめる。許可リスト外のホストは、--local（gitignore された保存先）のときだけ許す */
export function assertRecordable(raw: string, options: { local?: boolean } = {}): void {
  const host = new URL(raw).hostname;
  if (options.local) return;
  if (ALLOWED_HOSTS.some((re) => re.test(host))) return;
  const hint = SYNTHETIC_HOSTS.some((re) => re.test(host))
    ? "架空ドメインの応答は手で書いてください。"
    : "";
  throw new Error(
    `ホスト ${host} は録画の許可リストにありません。${hint}実サイトの応答は --local を付けて test/fixtures/local/ に保存してください（ADR 0019）。`,
  );
}
