# 0011 TypeScript一本の技術スタック

- 状態: 採用
- 日付: 2026-11-15

## 背景

個人開発で、実装は主に Claude Code が担う。API契約とLLMの出力スキーマを、フロントエンドとバックエンドで共有したい。

## 決定

TypeScript（strict）、Node 22、Hono、Vite＋React、Cytoscape.js、SQLite（better-sqlite3）＋Drizzle、Zod、`@anthropic-ai/sdk`、Vitest、Playwright を使う（[architecture](../spec/architecture.md#技術スタック)）。

## 検討した代替案

- Python（FastAPI）のバックエンドとTSのフロントエンド: データ処理は書きやすいが、型を二重に管理することになる。
- Next.js: 機能は多いが、ローカルの個人用アプリには重く、層の境界も曖昧になりやすい。

## 結果とトレードオフ

- 型を1か所（`shared/contract`）で管理できる。
- better-sqlite3 はネイティブモジュールなので、Windows でのインストールに注意する（ステップ1のCIで、Windowsでも確認する）。
