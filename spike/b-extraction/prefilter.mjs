// 事前フィルタ（data.md「事前フィルタ」の試作）。
// 単位（記事の段落、文字起こしの組）ごとに本文中の範囲を持ち、選んだ単位を抜き出す。
export const KEYWORDS_JA = [
  "影響",
  "好き",
  "愛読",
  "憧れ",
  "ファン",
  "敬愛",
  "尊敬",
  "心酔",
  "傾倒",
  "夢中",
  "聴いて",
  "読んで",
  "ベスト",
  "愛聴",
];
export const KEYWORDS_EN = [
  "influence",
  "influenced",
  "favorite",
  "favourite",
  "fan of",
  "admire",
  "inspired",
  "idol",
  "hero",
  "love",
  "loved",
];
export const WINDOW_SEC = 60;

const hit = (text) => {
  const t = text.normalize("NFKC").toLowerCase();
  return [...KEYWORDS_JA, ...KEYWORDS_EN].some((k) => t.includes(k));
};

/** 記事: 語を含む段落と、その前後1段落。units = [{start, end}] */
export function selectArticleUnits(body, units) {
  const keep = new Set();
  units.forEach((u, i) => {
    if (hit(body.slice(u.start, u.end))) for (const j of [i - 1, i, i + 1]) keep.add(j);
  });
  return units.filter((_, i) => keep.has(i));
}

/** 文字起こし: 語を含む組の前後60秒に入る組。segments = [{start, end, sec}] */
export function selectTranscriptUnits(body, segments) {
  const centers = segments.filter((s) => hit(body.slice(s.start, s.end))).map((s) => s.sec);
  return segments.filter((s) => centers.some((c) => Math.abs(s.sec - c) <= WINDOW_SEC));
}

/** 選んだ単位を、本文の順に並べて抜き出す。間が空くところに「…」を入れる。 */
export function excerpt(body, selected, sep) {
  const parts = [];
  let prevEnd = null;
  for (const u of selected) {
    if (prevEnd !== null)
      parts.push(body.slice(prevEnd, u.start).trim() === "" ? sep : `${sep}…${sep}`);
    parts.push(body.slice(u.start, u.end));
    prevEnd = u.end;
  }
  return parts.join("");
}

/** 記事の段落から単位を作る（body は段落を "\n\n" でつないだもの）。 */
export function paragraphUnits(paragraphs) {
  const units = [];
  let pos = 0;
  for (const p of paragraphs) {
    units.push({ start: pos, end: pos + p.length });
    pos += p.length + 2;
  }
  return units;
}

export const inUnits = (units, pos) => units.some((u) => pos >= u.start && pos < u.end);
