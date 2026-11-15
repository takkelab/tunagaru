# 0019 リポジトリを公開し、著作物と秘密情報の流出を機械的に防ぐ

- 状態: 採用
- 日付: 2026-11-15

## 背景

非公開リポジトリの GitHub Actions には月2,000分の無料枠があるが、本人は他のアプリ制作で多くを使っている。さらに、このプロジェクトのCIは Windows ランナー（消費が2倍）でも実行する。公開リポジトリなら、標準ランナーは無料で使える（2026年11月時点の理解。最新の条件は GitHub の料金ページで確認すること）。

公開にすると、次の2つのリスクが生じる。

1. **著作物の再配布**: このアプリは、インタビュー記事などの本文を取得してLLMに送る。cassette、本文のfixture、評価の目視判定CSVにそれが残ると、公開によって再配布になる。特に、**Anthropic の cassette にはリクエスト本文（＝記事の本文）がそのまま入る**。
2. **秘密情報の流出**: APIキーなどを一度 push すると、履歴に残る。

## 決定

リポジトリを公開する（[ADR 0014](0014-git-hooks-and-ci.md) の「非公開」を置き換える）。そのうえで、次の対策を**必須**とし、可能なかぎり lint・フック・設定で機械的に強制する。

### 1. 著作物を公開しない

- コミットしてよい本文は、**Wikipedia／Wikidata／MusicBrainz 由来のもの**（ライセンスと出典を記録する）と、**自分で書いた架空の文章（synthetic）**だけにする。
- インタビュー記事など、それ以外のサイトの本文は、どの形でもコミットしない。
  - 対象は、cassette、`test/fixtures/texts/`、スナップショット、評価の成果物。
  - URL取得アダプタとWeb検索アダプタのテストには、自分で書いた架空のHTMLとレスポンスを使う。
- Anthropic の cassette は、入力本文が Wikipedia 由来か synthetic のときだけ録画できる。
- `pnpm cassette:record` は、録画先のホストを許可リスト（Wikipedia、Wikidata、MusicBrainz、Anthropic）で制限する。それ以外のホストは録画を拒否する。どうしても実際のレスポンスが必要な場合は、gitignore された `test/fixtures/local/` にだけ保存できる。
- すべてのfixtureの出どころを `test/fixtures/PROVENANCE.json` に記録する（`wikipedia`＋URL＋revision id、`wikidata`、`musicbrainz`、`synthetic`）。独自lint `tools/lint/fixture-provenance.mjs` で、次の3点を検査する。
  - 未登録のfixtureがないこと
  - cassetteのホストが許可リストにあること
  - Anthropic の cassette の入力本文が、登録済みのWikipediaの本文か synthetic のfixtureと一致すること
- `eval/review/`（目視判定のCSV、引用を含む）、`eval/report.md`、`eval/runs/` は gitignore する。PRには `pnpm metrics` の数値の要約だけを貼る。

### 2. 秘密情報を流出させない

- gitleaks を lefthook の pre-commit と CI で実行する。
- GitHub の secret scanning と push protection を有効にする。
- cassette の秘密情報lint（R12）はそのまま残す。
- 秘密情報を検出するテストのfixtureは、テストの実行時に生成する。偽のキーをリポジトリに置くと、gitleaks に自分で引っかかるため。
- 万一 push してしまった場合は、履歴の書き換えではなく、**キーの無効化と再発行**を先に行う。

### 3. 公開リポジトリとしての基本設定

- コミットのメールアドレスは、GitHub の noreply アドレスにする。
- Actions の設定:
  - ワークフローの `permissions` は既定で読み取りのみ
  - `pull_request_target` は使わない
  - forkからのPRのワークフロー実行には承認を必須にする
  - 使う action は、コミットSHAで固定する
- CIは秘密情報を使わない（実APIを呼ばない方針を維持する。[ADR 0015](0015-record-replay-for-external-apis.md)）。
- LICENSE は置かない（すべての権利を留保する）。他の人に使ってもらいたくなったら、新しいADRで決める。
- `eval/gold/`（好きな作家の正解リスト）はコミットする。好みが他人に見えるのが気になれば、gitignore に移してよい。

## 検討した代替案

- 非公開のまま、Windows の CI を main へのマージ時だけにする: 分数は節約できるが、本人の無料枠の残りが少ない。
- 公開して、対策は運用ルール（注意書き）だけにする: エージェントが主に実装するため、文章だけでは守られない（[ADR 0017](0017-step-branch-pr-and-mechanical-prevention.md)）。

## 結果とトレードオフ

- URL取得や Web 検索のテストが架空のデータになり、実際のサイトの癖（崩れたHTMLなど）を拾いにくくなる。実際のサイトでの確認は `pnpm test:live` と `test/fixtures/local/` で、手元でのみ行う。
- 評価レポートの詳細は、リポジトリには残らない（手元にのみ残る）。基準値の数値は `metrics/baseline.json` として残す。
- 関係する仕様: [architecture R14・R15](../spec/architecture.md#lintで強制する設計ルール)、[testing](../spec/testing.md#fixtureの出どころ)、[process ステップ1](../spec/process.md#ステップ1-ハーネスの土台step01-harness)。
