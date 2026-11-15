# テスト

## 方針

- `pnpm test` は、**ネットワークもAPIキーもなしで通る**こと。外部APIは録画再生（cassette）かフェイクに置き換える。
- 実APIを呼ぶテストと評価は、手元でのみ実行する（`pnpm test:live`、`pnpm eval`）。これらは予算上限の対象で、CIでは実行しない（[ADR 0015](../decisions/0015-record-replay-for-external-apis.md)）。
- オブジェクトは、フィールドごとではなく**丸ごと**比較する（`expect(actual).toEqual(expected)`）。フィールドが増えたときに、テストが黙って通らないようにするため。
- 時刻・乱数・IDは、`Clock` と `IdGenerator` のポートを通して注入し、テストでは固定する。

## 層ごとのテスト

| 層         | 種類                                 | 置き場所                    | 外部の扱い                                                                      |
| ---------- | ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| `domain`   | 単体テスト（表形式のケースを多めに） | `src/domain/**/*.test.ts`   | なし（純粋関数）                                                                |
| `app`      | ユースケースのテスト                 | `src/app/**/*.test.ts`      | ポートのフェイク（メモリ上のrepo、決まった値を返すLLM）                         |
| `adapters` | 録画再生のテスト                     | `src/adapters/**/*.test.ts` | cassette を再生する。DBは一時ファイルのSQLite                                   |
| `server`   | 契約テスト                           | `src/server/**/*.test.ts`   | appにフェイクを組み込み、`app.request()` で叩いて contract のスキーマで検証する |
| `web`      | E2E                                  | `test/e2e/*.spec.ts`        | fixture DB（`test/fixtures/db/`）で server を起動し、外部APIは無効にする        |
| `tools`    | 独自lintとフックのテスト             | `tools/**/__tests__/`       | 違反を仕込んだfixture                                                           |

## 録画再生（cassette）

- 外部APIのクライアントは、`fetch` を差し替えられるように作る（adaptersのコンストラクタで `fetchImpl` を受け取る）。
- `pnpm cassette:record <name>` は、実APIを呼んで、リクエストとレスポンスを `test/fixtures/cassettes/<name>.json` に保存する。録画できるホストは許可リスト（Wikipedia、Wikidata、MusicBrainz、Anthropic）に限る（[fixtureの出どころ](#fixtureの出どころ)）。
  - 実行前に予算を確認する。Anthropicへの呼び出しは、`cost_ledger` に記録する。
  - 保存する前に、`x-api-key`、`authorization`、`cookie` などのヘッダーと、クエリの中のキーを除去する。`tools/lint/cassette-secrets.mjs` で、除去されていることを検査する（[architecture R12](architecture.md#lintで強制する設計ルール)）。
- `pnpm test` は再生だけを行う。cassette がない、またはリクエストが一致しない場合は**失敗する**（勝手に実APIを呼ばない）。
- 外部APIの仕様が変わったと疑われたら、録画し直し、差分をPRで見せる。

## fixtureの出どころ

リポジトリは公開する（[ADR 0019](../decisions/0019-public-repository-safeguards.md)）。記事の本文は著作物なので、**コミットしてよい本文を次の2種類に限る**。

| 出どころ                               | 使ってよい場所                                                                                                                                              | 記録すること                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `wikipedia`／`wikidata`／`musicbrainz` | Wikipedia・Wikidata・MusicBrainz アダプタの cassette、本文のfixture、それらを入力にした Anthropic の cassette                                               | URL、revision id（Wikipedia）、取得日、ライセンス（CC BY-SA または CC0） |
| `synthetic`（自分で書いた架空の文章）  | URL取得アダプタ（架空のHTML）、Web検索アダプタ（架空の検索結果）、動画の文字起こし（架空の発言とタイムスタンプ）、事前フィルタと照合器のテスト、E2E の seed | 「架空」と明記する。実在の人物名は使ってよいが、発言の内容は架空にする   |

- すべてのfixtureを `test/fixtures/PROVENANCE.json` に登録する。未登録のfixtureがあると、`tools/lint/fixture-provenance.mjs`（[R14](architecture.md#lintで強制する設計ルール)）が `pnpm lint` を失敗させる。
- Anthropic の cassette には、リクエスト本文（＝LLMに送った記事の本文）がそのまま入る。そのため、入力本文が登録済みのWikipediaの本文か synthetic のときだけ録画を許す。R14 でも、入力本文の照合を検査する。
- 実際のサイトの挙動を確かめたい場合は、`pnpm cassette:record --local` で `test/fixtures/local/`（gitignore）に保存し、手元でのみ使う。`pnpm test` は `local/` を読まない。
- 評価の成果物（`eval/review/`、`eval/runs/`、`eval/report.md`）は、実際の記事の引用を含むので gitignore する。
- スナップショットに実際の記事の本文が入らないように、スナップショットのテストの入力には synthetic の本文を使う。

## 秘密情報の検査

- gitleaks を lefthook の pre-commit と CI で実行する（[R15](architecture.md#lintで強制する設計ルール)）。設定は `.gitleaks.toml` に置く。
- gitleaks と `cassette-secrets.mjs` が検出できることを確かめるテストでは、偽のキーを**テストの実行時に生成**し、一時ディレクトリに書く。リポジトリには置かない。

## スナップショット

[ADR 0018](../decisions/0018-schema-generation-and-snapshots.md)（openai/codex を参考にした）

対象は次のとおり。いずれも、意図しない変化を差分としてレビューで見せるために使う。

- LLMに送るプロンプトの全文（システムプロンプトと、事前フィルタ後のユーザー入力の組み立て）
- CLIの出力（`budget`、`overlaps`、`extract --dry-run`、`investigate --dry-run`）
- 評価レポートの形式（数値はfixtureで固定する）
- 生成した JSON Schema（`schema/`。こちらは [api](api.md#契約とスキーマのずれ検知) のずれ検知で扱う）

スナップショットの更新（`pnpm test -u`）は、変化が意図どおりだと確認してから行う。PRの本文には、更新した理由を書く。

## live と評価

| コマンド         | 内容                                                                               | 必要なもの                      |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| `pnpm test:live` | 実APIを少数だけ呼ぶスモークテスト（Wikidata検索、URL取得、Haikuで1回抽出）         | `ANTHROPIC_API_KEY`、予算の残り |
| `pnpm eval`      | `eval/gold/` に対して、ソース別・モデル別に抽出品質を測る（[metrics](metrics.md)） | 同上                            |

どちらも、実行前に見積もり額を表示して確認を求める（`--yes` で省略できる）。

## カバレッジ

閾値は [metrics](metrics.md#コードの健全性) を参照。Vitest の `coverage.thresholds` に設定し、下回ると `pnpm test` が失敗するようにする。

## 実行の順番

1. 変更した範囲のテスト: `pnpm test src/domain/quote`（パスで絞る）
2. 一括検証: `pnpm check`
3. UIに関わる変更なら: `pnpm e2e`
4. 抽出・プロンプト・モデルの変更なら: `pnpm eval`（手元、予算内で）

## コマンド一覧

| 目的             | コマンド                                                        | 中身                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 依存インストール | `pnpm install`                                                  |                                                                                                                                                                                                              |
| 型チェック       | `pnpm typecheck`                                                | `tsc --noEmit -p tsconfig.json`                                                                                                                                                                              |
| Lint             | `pnpm lint`                                                     | `biome check .` → `depcruise src` → `node tools/lint/file-length.mjs` → `node tools/lint/docs.mjs` → `markdownlint-cli2` → `node tools/lint/cassette-secrets.mjs` → `node tools/lint/fixture-provenance.mjs` |
| 秘密情報の検査   | `pnpm secrets`                                                  | `gitleaks detect`（pre-commit では `gitleaks protect --staged`）                                                                                                                                             |
| 設計ルールだけ   | `pnpm lint:arch`                                                | `depcruise src --config .dependency-cruiser.cjs`                                                                                                                                                             |
| 自動修正         | `pnpm fix`                                                      | `biome check --write .`                                                                                                                                                                                      |
| フォーマット     | `pnpm format`                                                   | `biome format --write .`                                                                                                                                                                                     |
| スキーマ生成     | `pnpm gen:schema`                                               | `node tools/schema/gen.mjs`                                                                                                                                                                                  |
| テスト           | `pnpm test`                                                     | `vitest run`（カバレッジの閾値つき）                                                                                                                                                                         |
| E2E              | `pnpm e2e`                                                      | `playwright test`                                                                                                                                                                                            |
| 一括検証         | `pnpm check`                                                    | typecheck → lint → `node tools/schema/gen.mjs --check` → test                                                                                                                                                |
| 録画             | `pnpm cassette:record <name>`                                   | 実APIを呼ぶ                                                                                                                                                                                                  |
| live             | `pnpm test:live`                                                | 実APIを呼ぶ                                                                                                                                                                                                  |
| 評価             | `pnpm eval`                                                     | 実APIを呼ぶ                                                                                                                                                                                                  |
| 指標             | `pnpm metrics`                                                  | `metrics/latest.json` を出力する                                                                                                                                                                             |
| 開発起動         | `pnpm dev`                                                      | server と Vite                                                                                                                                                                                               |
| DB               | `pnpm db:migrate`、`pnpm db:seed:fixture`、`pnpm seed:wikidata` |                                                                                                                                                                                                              |
