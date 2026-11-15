# 使い捨ての試作（spike）

本番の部品を作る前に、体験・抽出・自動調査を確かめるための使い捨てのコードです（[ADR 0025](../docs/decisions/0025-prototype-first-then-auto-investigation.md)、[process: 本番の前の試作](../docs/spec/process.md#本番の前の試作使い捨て)）。

- 実際の記事の本文・引用・LLMの結果は `spike/data/` と `spike/out/` に置きます。どちらも gitignore しているので、コミットされません（[ADR 0019](../docs/decisions/0019-public-repository-safeguards.md)）。
- ここのコードは `src/` から import しません。テストとカバレッジの基準は求めません（Biome と gitleaks は適用します）。

## 試作A: 体験（`a-ux/`）

```sh
pnpm spike:ux        # http://127.0.0.1:8790/ を開く
```

`spike/data/likes.json`（手入力のデータ）を読み、次の3つの画面を出します。重なりは「n人」の印と「重なりだけ」の切り替えで見ます。

- **作品**: 起点ごとに、挙げられた作品の表紙が並ぶ棚。押すと、本人の言葉と、記事のその箇所（テキストフラグメント）や動画のその場面（t=秒）へのリンクが出る
- **人**: 起点ごとに、好きな作家・アーティストの写真が並ぶ。押すと、その人について語った言葉がまとめて出る
- **つながり**: 起点 → 作品 → 作り手をノード型で表示する（Cytoscape.js を CDN から読み込む）
- **気になる**: ☆を付けた作品

- 引用に作り手か作品の固有名詞（別名を含む）がない根拠は使いません。
- 表紙は iTunes Search（日本のストア。本は電子書籍）から、写真は Wikidata の肖像（P18、Wikimedia Commons）から取り、`spike/out/covers.json` にキャッシュします。Wikidata には1件ずつ問い合わせます。
- 非表示と「気になる」は、ブラウザの localStorage にだけ保存します。非表示にしたものは、直後の「元に戻す」か、棚の下の「非表示にしたもの」から戻せます。
