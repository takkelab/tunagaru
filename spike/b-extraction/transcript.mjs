// 文字起こしの解析（data.md「文字起こし」の試作）。
// YouTube の「文字起こしを表示」をコピーすると、1行が「0:16」「16 秒」「発言」の連結になる
// （例: 「0:1616 秒お二人は…」「1:031 分 3 秒えっ私は…」）。読み上げ用の「n 秒」は捨てる。
const LINE = /^(\d+(?::\d{2}){1,2})(?:\d+\s*時間\s*)?(?:\d+\s*分\s*)?(?:\d+\s*秒)?\s*(.*)$/u;

const toSec = (ts) => ts.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);

/** 返り値: { body, segments: [{ start, end, sec }], kind: "transcript"|"paste" } */
export function parseTranscript(raw) {
  const groups = [];
  for (const line of raw.split(/\r?\n/u)) {
    const t = line.trim();
    if (!t) continue;
    const m = LINE.exec(t);
    if (m) groups.push({ sec: toSec(m[1]), text: m[2] });
    else if (groups.length) groups.at(-1).text += ` ${t}`;
    else groups.push({ sec: null, text: t });
  }
  const segments = [];
  let body = "";
  for (const g of groups) {
    if (body) body += "\n";
    segments.push({ start: body.length, end: body.length + g.text.length, sec: g.sec });
    body += g.text;
  }
  const kind = groups.some((g) => g.sec !== null) ? "transcript" : "paste";
  return { body, segments, kind };
}

/** 本文中の位置を含む組の秒。 */
export function secAt(segments, pos) {
  let sec = null;
  for (const s of segments) {
    if (s.start > pos) break;
    if (s.sec !== null) sec = s.sec;
  }
  return sec;
}

export function videoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) {
      return (
        u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|live)\/([^/]+)/u)?.[1] ?? null
      );
    }
  } catch {}
  return null;
}

export function timeLink(url, sec) {
  const id = videoId(url);
  if (!id || sec === null) return url ?? null;
  return `https://www.youtube.com/watch?v=${id}&t=${sec}s`;
}
