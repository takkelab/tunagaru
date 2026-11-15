# 使い捨ての試作（spike）

本番の部品を作る前に、体験・抽出・自動調査を確かめるための使い捨てのコードです（[ADR 0025](../docs/decisions/0025-prototype-first-then-auto-investigation.md)、[process: 本番の前の試作](../docs/spec/process.md#本番の前の試作使い捨て)）。

- 実際の記事の本文・引用・LLMの結果は `spike/data/` と `spike/out/` に置きます。どちらも gitignore しているので、コミットされません（[ADR 0019](../docs/decisions/0019-public-repository-safeguards.md)）。
- ここのコードは `src/` から import しません。テストとカバレッジの基準は求めません（Biome と gitleaks は適用します）。

## 試作A: 体験（`a-ux/`）

```sh
pnpm spike:ux        # http://127.0.0.1:8790/ を開く
```

`spike/data/likes.json`（手入力のデータ）を読み、重なりの一覧・起点ごとの棚・根拠パネル・気になる作品を表示します。確認・却下・「気になる」は、ブラウザの localStorage にだけ保存します。
