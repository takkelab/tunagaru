// 結果を、本人が正誤をつける review.md と、PR に書ける数値（引用なし）の summary.md にする。
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fmtSec = (s) =>
  s === null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function item(r, i) {
  const who = `${r.subject_name}${r.subjectIsSeed ? "" : "（取材対象ではない）"}`;
  const work = r.work_title ? `『${r.work_title}』` : "";
  const m =
    r.match === "none" ? `破棄: ${r.reason} 類似度 ${r.similarity}` : `${r.match} ${r.similarity}`;
  const at =
    r.sec === null
      ? ""
      : r.link
        ? ` [${fmtSec(r.sec)}](${r.link})`
        : ` ${fmtSec(r.sec)}（動画のURLなし）`;
  const lines = [
    `### ${i + 1}. ${who} → ${r.object_name}${work}`,
    "",
    `- 極性 \`${r.polarity}\` ／ 発言者 \`${r.attribution}\` ／ 照合 ${m}${at}`,
    "- 判定: （○ ／ × と、×なら誤りの種類: 発言者の取り違え・極性・相手の取り違え・作り手でない・その他）",
    "",
  ];
  if (r.span) lines.push(`> ${r.span.text.replace(/\n/gu, " ")}`, "");
  else {
    lines.push(`LLMの quote: ${r.quote}`, "");
    if (r.nearest) lines.push(`いちばん近い本文: ${r.nearest.text.replace(/\n/gu, " ")}`, "");
  }
  if (r.translation) lines.push(`訳: ${r.translation}`, "");
  return lines.join("\n");
}

function stats(s) {
  const rs = s.results ?? [];
  const kept = rs.filter((r) => r.match !== "none");
  return {
    statements: rs.length,
    exact: kept.filter((r) => r.match === "exact").length,
    fuzzy: kept.filter((r) => r.match === "fuzzy").length,
    dropped: rs.length - kept.length,
    notSeed: kept.filter((r) => !r.subjectIsSeed).length,
    gold: (s.gold ?? []).length,
    goldInFilter: (s.gold ?? []).filter((g) => g.inFilter).length,
    goldFound: (s.gold ?? []).filter((g) => g.found).length,
  };
}

export function writeReport(dir, summaries, { model, promptVersion }) {
  const review = [
    "# 試作B: 抽出の結果（正誤をつける）",
    "",
    `モデル ${model} ／ prompt_version ${promptVersion}。このファイルは gitignore 済み。`,
    "",
  ];
  const rows = [
    "| 出典 | 種類 | 抽出 | 完全一致 | あいまい一致 | 破棄 | 取材対象外 | 正解の数 | フィルタを通った正解 | 拾えた正解 | 入力 | 出力 | 実費（円） |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  let total = 0;
  for (const s of summaries) {
    if (s.error) {
      rows.push(`| ${s.id} | 読み込めない: ${s.error} |  |  |  |  |  |  |  |  |  |  |  |`);
      continue;
    }
    const st = stats(s);
    total += s.yen;
    rows.push(
      `| ${s.input.id} | ${s.input.kind} | ${st.statements} | ${st.exact} | ${st.fuzzy} | ${st.dropped} | ${st.notSeed} | ${st.gold} | ${st.goldInFilter} | ${st.goldFound} | ${s.usage.input} | ${s.usage.output} | ${s.yen.toFixed(3)} |`,
    );
    review.push(`## ${s.input.title}`, "", s.input.url ? `<${s.input.url}>` : "（URLなし）", "");
    const kept = s.results.filter((r) => r.match !== "none");
    const dropped = s.results.filter((r) => r.match === "none");
    kept.forEach((r, i) => {
      review.push(item(r, i));
    });
    if (dropped.length) {
      review.push("#### 照合で破棄したもの", "");
      dropped.forEach((r, i) => {
        review.push(item(r, kept.length + i));
      });
    }
    const missed = s.gold.filter((g) => !g.found);
    if (missed.length) {
      review.push("#### 手入力の正解のうち、拾えなかったもの", "");
      for (const g of missed) {
        review.push(
          `- ${g.creator}${g.work ? `『${g.work}』` : ""}（フィルタ: ${g.inFilter === null ? "本文に見つからない" : g.inFilter ? "通った" : "落ちた"}）`,
        );
      }
      review.push("");
    }
  }
  // 本人が判定を書き込んだ review.md は上書きしない（新しい結果は review.new.md に出す）
  const reviewPath = join(dir, existsSync(join(dir, "review.md")) ? "review.new.md" : "review.md");
  writeFileSync(reviewPath, `${review.join("\n").trimEnd()}\n`);
  const summary = [
    "# 試作B: 数値のまとめ（引用を含まない）",
    "",
    `モデル ${model} ／ prompt_version ${promptVersion}`,
    "",
    ...rows,
    "",
    `実費の合計: ${total.toFixed(3)}円`,
    "",
  ];
  writeFileSync(join(dir, "summary.md"), summary.join("\n"));
}
