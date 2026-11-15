# 0013 Biome＋dependency-cruiser＋独自lint＋markdownlint

- 状態: 採用
- 日付: 2026-11-15

## 背景

Biome は速く、設定も少ないが、フォルダ間のimportの禁止のような細かい境界の制御は苦手。docs も仕様の一部なので、検査したい。

## 決定

- 一般的なlintとフォーマットには Biome を使う。フォルダごとのグローバル変数の制限（`noRestrictedGlobals`）も Biome で行う。
- 層の境界、SDKを使える場所の限定、循環参照は dependency-cruiser で検査する。
- ファイルの行数、docsのリンクとADRの一覧、cassetteの秘密情報は、`tools/lint/` の独自lintで検査する（openai/codex が独自lintを道具として持っているのを参考にした）。
- docs は markdownlint-cli2 で検査する。

## 検討した代替案

- ESLint（typescript-eslint＋boundaries）: 最も柔軟だが、遅く、設定が複雑になる。

## 結果とトレードオフ

- ツールが4種類になる。`pnpm lint` を1つの入口にまとめて、意識しなくてよいようにする（[architecture](../spec/architecture.md#lintで強制する設計ルール)）。
- 型情報を使ったlintルールは使えない（必要になったら新しいADRで検討する）。
