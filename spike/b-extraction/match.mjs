// 引用照合（data.md「引用照合」の試作）。LLMの quote を手がかりに、本文側の範囲を探す。
export const FUZZY_THRESHOLD = 0.85;
export const LENGTH_TOLERANCE = 0.2;
export const MAX_SPAN = 200;

const QUOTES = /[“”„«»「」『』'‘’"]/u;
const DASHES = /[—–―ー\-‐−]/u;

const isKatakana = (c) => c >= "ァ" && c <= "ヺ";
const kataToHira = (c) =>
  c >= "ァ" && c <= "ヶ" ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c;

/**
 * 照合用に正規化する。map[i] は、正規化後の i 文字目が来た元の本文の位置。
 * fuzzy では、カタカナをひらがなにそろえ、空白を消す（自動字幕の空白の揺れを吸収するため。試作で足した規則）。
 */
export function normalize(text, { fuzzy = false } = {}) {
  const out = [];
  const map = [];
  let prevSpace = true;
  let prevRaw = "";
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i));
    for (const c of ch.normalize("NFKC")) {
      if (/\s/u.test(c)) {
        if (!prevSpace && !fuzzy) {
          out.push(" ");
          map.push(i);
        }
        prevSpace = true;
        continue;
      }
      prevSpace = false;
      let d = c.toLowerCase();
      if (QUOTES.test(d)) d = '"';
      else if (DASHES.test(d) && !(d === "ー" && isKatakana(prevRaw))) d = "-";
      prevRaw = c;
      if (fuzzy) d = kataToHira(d);
      out.push(d);
      map.push(i);
    }
    i += ch.length;
  }
  if (out.at(-1) === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

/** 本文 T の部分文字列のうち、P との編集距離が最小のもの（長さは P の±20%）。 */
export function approxSearch(T, P) {
  const m = P.length;
  const minLen = Math.floor(m * (1 - LENGTH_TOLERANCE));
  const maxLen = Math.ceil(m * (1 + LENGTH_TOLERANCE));
  let D = new Int32Array(m + 1);
  let S = new Int32Array(m + 1);
  let C = new Int32Array(m + 1);
  let St = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) D[i] = i;
  let best = { dist: Number.POSITIVE_INFINITY, start: -1, end: -1 };
  for (let j = 1; j <= T.length; j++) {
    C[0] = 0;
    St[0] = j;
    const t = T[j - 1];
    for (let i = 1; i <= m; i++) {
      const sub = D[i - 1] + (P[i - 1] === t ? 0 : 1);
      const del = D[i] + 1;
      const ins = C[i - 1] + 1;
      if (sub <= del && sub <= ins) {
        C[i] = sub;
        St[i] = S[i - 1];
      } else if (del <= ins) {
        C[i] = del;
        St[i] = S[i];
      } else {
        C[i] = ins;
        St[i] = St[i - 1];
      }
    }
    const len = j - St[m];
    if (C[m] < best.dist && len >= minLen && len <= maxLen) {
      best = { dist: C[m], start: St[m], end: j };
    }
    [D, C] = [C, D];
    [S, St] = [St, S];
  }
  return best;
}

function toSource(body, map, s, e) {
  const start = map[s];
  const last = map[e - 1];
  const end = last + String.fromCodePoint(body.codePointAt(last)).length;
  return { start, end, text: body.slice(start, end) };
}

/**
 * quote の位置を探す。names は相手の名前・別名・作品名（あいまい一致で範囲に含まれていることを求める）。
 * 返り値: { match: "exact"|"fuzzy"|"none", similarity, span?: {start,end,text}, reason? }
 */
export function locate(body, quote, names) {
  const nb = normalize(body);
  const nq = normalize(quote);
  if (!nq.text) return { match: "none", similarity: 0, reason: "empty" };
  const idx = nb.text.indexOf(nq.text);
  if (idx >= 0) {
    return {
      match: "exact",
      similarity: 1,
      span: clip(toSource(body, nb.map, idx, idx + nq.text.length)),
    };
  }
  const fb = normalize(body, { fuzzy: true });
  const fq = normalize(quote, { fuzzy: true });
  const best = approxSearch(fb.text, fq.text);
  if (best.start < 0) return { match: "none", similarity: 0, reason: "no-candidate" };
  const similarity = 1 - best.dist / fq.text.length;
  const span = toSource(body, fb.map, best.start, best.end);
  const window = fb.text.slice(best.start, best.end);
  const hasName = names
    .filter(Boolean)
    .map((n) => normalize(n, { fuzzy: true }).text)
    .some((n) => n && window.includes(n));
  if (similarity < FUZZY_THRESHOLD) {
    return { match: "none", similarity, reason: "low-similarity", nearest: clip(span) };
  }
  if (!hasName) return { match: "none", similarity, reason: "no-name", nearest: clip(span) };
  return { match: "fuzzy", similarity, span: clip(span) };
}

function clip(span) {
  if (span.text.length <= MAX_SPAN) return span;
  return { ...span, text: span.text.slice(0, MAX_SPAN), clipped: true };
}
