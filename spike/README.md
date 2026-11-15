# 使い捨ての試作（spike）

本番の部品を作る前に、体験・抽出・自動調査を確かめるための使い捨てのコードです（[ADR 0025](../docs/decisions/0025-prototype-first-then-auto-investigation.md)、[process: 本番の前の試作](../docs/spec/process.md#本番の前の試作使い捨て)）。

- 実際の記事の本文・引用・LLMの結果は `spike/data/` と `spike/out/` に置きます。どちらも gitignore しているので、コミットされません（[ADR 0019](../docs/decisions/0019-public-repository-safeguards.md)）。
- ここのコードは `src/` から import しません。テストとカバレッジの基準は求めません（Biome と gitleaks は適用します）。

## 試作A: 体験（`a-ux/`）

```sh
pnpm spike:ux        # http://127.0.0.1:8790/ を開く
```

`spike/data/likes.json`（手入力のデータ）を読み、次の画面を出します。重なりは「n人」の印と「重なりだけ」の切り替えで見ます。

- **作品**: 起点ごとに、挙げられた作品の表紙が並ぶ棚。押すと、本人の言葉（「〇〇のオススメ」）と、記事のその箇所（テキストフラグメント）や動画のその場面（t=秒）へのリンクが出る
- **つながり**: 人だけのノード型（起点 → 好きな作り手）。人を押すと、起点からの道筋が濃くなり、図の横にパネルが開く（図は縮むだけで隠れない）。枠が実線なら調べ済み、点線ならパネルの「＋ 好きな人を探す」で先へたどれる。試作B・Cでつなぐまでは架空の「仮の人」が伸びる。探しても今ある点は動かさない。配置と広がりは localStorage に残す（「仮の広がりを消す」で戻す）。線を押すと「誰がどこで語ったか」。根拠がすべて要注意の線は破線。Cytoscape.js を CDN から読み込む
- **気になる**: ☆を付けた作品

- 起点の人の「主な作品」は、本とアルバムの両方を iTunes Search で探す。名前が短くて別人に当たる人や、バンド名で活動している人は、データの `worksAs`（例: MICO → `["SHE IS SUMMER"]`）の名前で探す
- 引用に作り手か作品の固有名詞（別名を含む）がない根拠は使いません。
- 表紙は iTunes Search（日本のストア。本は電子書籍）から、写真は Wikidata の肖像（P18、Wikimedia Commons）から取り、`spike/out/covers.json` にキャッシュします。Wikidata には1件ずつ問い合わせます。
- 非表示と「気になる」は、ブラウザの localStorage にだけ保存します。非表示にしたものは、直後の「元に戻す」か、棚の下の「非表示にしたもの」から戻せます。

## 試作B: 抽出（`b-extraction/`）

```sh
pnpm spike:extract --dry-run   # LLMを呼ばずに、フィルタ前後の字数・見積もり額・正解がフィルタを通るかを出す
pnpm spike:extract             # Haiku 5.5 を呼ぶ（.env の ANTHROPIC_API_KEY を使う）
pnpm spike:extract --only vivi # 1本だけ
```

- 入力は `spike/data/likes.json` の `sources`（記事はURLから取得し、動画は `spike/data/transcripts/` の文字起こし）。手入力の `likes` を正解として、拾えたかを数える。
- 流れ: 本文の取得（robots.txt を確認し、Readability で段落に分ける）→ 事前フィルタ → Haiku で抽出（構造化出力）→ 位置を探す照合（完全一致、だめならあいまい一致）。
- あいまい一致では、仕様の正規化に加えて空白を消す（自動字幕の空白の揺れを吸収するため。試作で足した規則）。
- 結果は `spike/out/b/` に書く。`review.md` に本人が正誤をつけ、`summary.md` の数値（引用を含まない）を PR に写す。LLMの結果は `runs/` にキャッシュし、同じ本文とプロンプトでは呼ばない。合計が50円を超えそうなら止まる。

## 試作C: 自動調査（`c-search/`）

```sh
pnpm spike:search --dry-run   # APIを呼ばずに、検索語の一覧と見積もり額を出す
pnpm spike:search             # 検索する（.env の ANTHROPIC_API_KEY を使う）
pnpm spike:search --only mico # 1人だけ
pnpm spike:search --report    # review.md の判定を読み、summary.md を書く
```

- 起点は `run.mjs` の `SEEDS`（`spike/data/likes.json` の起点ID）。
- 検索語の型: `人名 インタビュー`、`別名 インタビュー`、`作品名 人名 インタビュー`、`人名 好きな本`、`人名 好きな音楽`、`人名 愛読書`、`人名 影響を受けた`。`worksAs` がある人（例: MICO）は、人名に活動名を添える。
- 作品名は、`worksAs` がある人は iTunes Search のアルバムとEP（新しい順）、それ以外は Wikidata の出演・著者・演奏（サイトリンクの多い順）から3つ取り、`spike/out/c/works.json` にキャッシュする。
- 検索は、検索語1つにつき1回だけ呼ぶ（Haiku 5.5 と `web_search_20250305`、`max_uses: 1`）。URL はモデルの答えではなく、検索結果のブロックからそのまま取る。歌詞・ストアのサイトは `blocked_domains` で外す。
- 結果は `spike/out/c/` に書く。`review.md` に本人が判定（◎ 好きが出てくる発言の記事／○ 発言の記事／× 外れ）をつける。検索結果は `runs/` にキャッシュし、同じ検索語と設定では呼ばない。合計が100円を超えそうなら止まる。
- 判定は、各検索の上位3位まで（`run.mjs` の `TOP`）に絞る。`--snippets` で本文を取得して抜粋（`snippets.txt`）を作り、Claude Code がそれを読んで下書き（`drafts.json`）を書く。`--review` で下書きを入れた `review.md` を作り、本人が直す。`summary.md` に、下書きと本人の判定が一致した割合を出す。
