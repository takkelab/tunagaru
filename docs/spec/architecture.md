# アーキテクチャ

## 技術スタック

[ADR 0011](../decisions/0011-typescript-stack.md)

| 層・用途       | 採用                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 言語・実行環境 | TypeScript（`strict`、`noUncheckedIndexedAccess`）、Node.js 22 LTS                                                                                                         |
| パッケージ管理 | pnpm（単一パッケージ。[ADR 0012](../decisions/0012-single-package-layered-folders.md)）                                                                                    |
| APIサーバー    | Hono＋`@hono/node-server`（`127.0.0.1:8787`）                                                                                                                              |
| UI             | Vite＋React（グラフ表示の Cytoscape.js は保留。[ADR 0022](../decisions/0022-overlaps-of-seed-people-as-core.md)）                                                          |
| DB             | SQLite（better-sqlite3）＋Drizzle ORM／drizzle-kit                                                                                                                         |
| バリデーション | Zod（API契約とLLMの構造化出力）                                                                                                                                            |
| LLM            | `@anthropic-ai/sdk`。既定のモデルは `claude-haiku-5-5`、構造化出力（`output_config.format`）を使う。モデルは設定で `claude-sonnet-5-5`／`claude-opus-5-5` に切り替えられる |
| 本文の抽出     | `@mozilla/readability`＋`linkedom`                                                                                                                                         |
| 外部データ     | Wikidata（SPARQL・`wbsearchentities`）、記事のURL、Claude の Web 検索ツール（ステップ8）、Wikipedia（REST・Action API、ja/en。ステップ9）、MusicBrainz（ステップ10）       |
| テスト         | Vitest（単体・統合・スナップショット・カバレッジ）、Playwright（E2E）                                                                                                      |
| 検査           | Biome（lintとformat）、dependency-cruiser（層の境界）、markdownlint-cli2（docs）、`tools/lint/`（独自lint）                                                                |
| フック・CI     | Claude Code のフック（`.claude/settings.json`）、lefthook（git）、GitHub Actions                                                                                           |

Windows 11 で動くこと。npm scripts の中ではシェル固有の構文（`&&` 以外の連結、`rm -rf`、環境変数の前置きなど）を使わず、Nodeのスクリプトか `cross-env` 相当で書く。

## 層と依存の向き

```text
             ┌──────────── composition root ────────────┐
             │  src/server/main.ts      src/cli/main.ts │  ← adapters を組み立てて app に渡す
             └───────────────┬──────────────────────────┘
                             │
  src/web ──► src/shared/contract ──► src/domain ◄── src/app ◄── src/adapters
   (UI)        (Zodスキーマ・型)       (純粋ロジック)  (ユースケース  (DB・外部API・
                                                        ＋ポート)     LLM・時計)
  src/server/routes ──► src/app, src/shared
  src/cli/commands  ──► src/app, src/shared
```

| 層                     | 置くもの                                                                                                                                                 | 依存してよい先                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/domain/`          | 列挙値、引用照合と正規化、極性の表示ルール、並び順、予算計算、事前フィルタ、名寄せの判定ロジック。**入出力も時刻も乱数も扱わない**                       | なし（外部パッケージも使わない）                      |
| `src/app/`             | ユースケース（検索、起点、調査、名寄せ、統合、重なり、確認）と、ポート（`EntityRepo`、`LlmExtractor`、`WikidataClient`、`Clock` などのインターフェース） | `domain`                                              |
| `src/adapters/`        | ポートの実装。`db/`、`wikidata/`、`wikipedia/`、`musicbrainz/`、`web/`（URLの取得とReadability）、`anthropic/`、`search/`、`clock/`                      | `domain`、`app` のポート定義（`src/app/ports/`）      |
| `src/shared/contract/` | APIとLLM出力の Zod スキーマと、そこから導いた型                                                                                                          | `domain`（列挙値の再利用のみ）、`zod`                 |
| `src/shared/config/`   | 設定と環境変数の読み込み                                                                                                                                 | `zod`                                                 |
| `src/server/`          | Honoのルート（`routes/`）と composition root（`main.ts`）                                                                                                | `app`、`shared`。adapters を使えるのは `main.ts` だけ |
| `src/cli/`             | コマンド（`commands/`）と composition root（`main.ts`）                                                                                                  | `app`、`shared`。adapters を使えるのは `main.ts` だけ |
| `src/web/`             | React UI                                                                                                                                                 | `shared/contract` のみ                                |

## lintで強制する設計ルール

ルールは文章だけで終わらせず、必ずコマンドで検出できるようにする（[ADR 0013](../decisions/0013-lint-toolchain.md)、[ADR 0017](../decisions/0017-step-branch-pr-and-mechanical-prevention.md)）。
違反したときのエラーメッセージには、**直し方と、この章へのリンク**を含める（dependency-cruiser は `comment`、独自lintは出力文で）。

| #   | ルール                                                                                                                                                                                                                                                                                                                                          | 検出するツール                                                     | ルール名・場所                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| R1  | `domain` は他の層も外部パッケージも import しない（Nodeの組み込みモジュールも禁止）                                                                                                                                                                                                                                                             | dependency-cruiser                                                 | `domain-is-pure`                       |
| R2  | `app` が依存してよいのは `domain` だけ                                                                                                                                                                                                                                                                                                          | dependency-cruiser                                                 | `app-depends-on-domain-only`           |
| R3  | `adapters` が依存してよいのは `domain` と `app/ports` だけ。adapters 同士の import も禁止（`adapters/db` が `adapters/wikidata` を使うなど）                                                                                                                                                                                                    | dependency-cruiser                                                 | `adapters-boundary`                    |
| R4  | `web` が依存してよいのは `shared/contract` と、UIの外部パッケージだけ                                                                                                                                                                                                                                                                           | dependency-cruiser                                                 | `web-uses-contract-only`               |
| R5  | `adapters` を import してよいのは `src/server/main.ts` と `src/cli/main.ts` だけ                                                                                                                                                                                                                                                                | dependency-cruiser                                                 | `only-composition-root-wires-adapters` |
| R6  | `@anthropic-ai/sdk` は `adapters/anthropic/` から、`better-sqlite3`・`drizzle-orm` は `adapters/db/` から、`@mozilla/readability`・`linkedom` は `adapters/web/` からだけ import できる                                                                                                                                                         | dependency-cruiser                                                 | `sdk-confinement`                      |
| R7  | 循環参照の禁止                                                                                                                                                                                                                                                                                                                                  | dependency-cruiser                                                 | `no-circular`                          |
| R8  | `fetch` と `process.env` は、`adapters/` と `shared/config/` でのみ使える。`domain` では `Date`・`Math.random`・`setTimeout` も禁止                                                                                                                                                                                                             | Biome の `noRestrictedGlobals`（`overrides` でフォルダごとに設定） | `biome.json`                           |
| R9  | 1ファイルは300行まで（テスト・fixture・生成物は除く）。超えたら、新しい機能は新しいモジュールに書く                                                                                                                                                                                                                                             | 独自lint                                                           | `tools/lint/file-length.mjs`           |
| R10 | docs: markdownlint を通す。ADRの番号が連番で、`docs/decisions/README.md` の一覧に載っている。SPEC.md と docs の相対リンクが切れていない                                                                                                                                                                                                         | markdownlint-cli2、独自lint                                        | `tools/lint/docs.mjs`                  |
| R11 | contract から生成した JSON Schema が、コミット済みの `schema/` と一致している                                                                                                                                                                                                                                                                   | 独自スクリプト                                                     | `tools/schema/gen.mjs --check`         |
| R12 | cassette に APIキーや Authorization ヘッダーが含まれていない                                                                                                                                                                                                                                                                                    | 独自lint                                                           | `tools/lint/cassette-secrets.mjs`      |
| R13 | `any` の禁止（`noExplicitAny`）、未使用の import と変数の禁止、`console.log` は `src/cli/` と `tools/` 以外で禁止                                                                                                                                                                                                                               | Biome                                                              | `biome.json`                           |
| R14 | `test/fixtures/` のすべてのファイルが `PROVENANCE.json` に登録され、出どころが `wikipedia`／`wikidata`／`musicbrainz`／`synthetic` のいずれかである。cassette のホストが許可リストにある。Anthropic の cassette の入力本文が、登録済みのWikipediaの本文か synthetic と一致する（[ADR 0019](../decisions/0019-public-repository-safeguards.md)） | 独自lint                                                           | `tools/lint/fixture-provenance.mjs`    |
| R15 | 秘密情報（APIキー、トークン、秘密鍵）がコミットに含まれない                                                                                                                                                                                                                                                                                     | gitleaks（pre-commit と CI）、GitHub の push protection            | `.gitleaks.toml`                       |

どのルールにも、**違反を仕込んだfixtureで検出できることを確かめるテスト**を `tools/lint/__tests__/` に置く。ルールが黙って効かなくなるのを防ぐため。

## フォルダ構成

```text
tunagaru/
├─ AGENTS.md                   エージェント向け指示の正（短く保つ）
├─ CLAUDE.md                   "@AGENTS.md" の1行のみ
├─ SPEC.md                     仕様書の入口
├─ README.md                   起動方法だけ
├─ package.json  pnpm-lock.yaml  tsconfig.json  biome.json
├─ .dependency-cruiser.cjs  .markdownlint-cli2.jsonc  lefthook.yml  .gitleaks.toml
├─ vitest.config.ts  playwright.config.ts  drizzle.config.ts
├─ .env.example                ANTHROPIC_API_KEY など（.env は gitignore）
├─ .claude/
│  └─ settings.json            Stopフック・PostToolUseフック
├─ .github/workflows/ci.yml
├─ docs/
│  ├─ spec/                    この仕様書の各章
│  ├─ decisions/               ADR
│  └─ process/incidents/       詰まったときの記録
├─ src/
│  ├─ domain/      AGENTS.md
│  ├─ app/         AGENTS.md
│  │  ├─ ports/                インターフェースだけ
│  │  └─ usecases/
│  ├─ adapters/    AGENTS.md
│  │  ├─ db/  wikidata/  wikipedia/  musicbrainz/  web/  anthropic/  search/  clock/
│  ├─ shared/
│  │  ├─ contract/
│  │  └─ config/
│  ├─ server/
│  │  ├─ routes/
│  │  └─ main.ts
│  ├─ cli/
│  │  ├─ commands/
│  │  └─ main.ts
│  └─ web/         AGENTS.md
├─ tools/
│  ├─ lint/                    独自lint（file-length, docs, cassette-secrets）と __tests__/
│  ├─ hooks/                   stop-check.mjs など
│  ├─ schema/                  gen.mjs
│  └─ cassette/                録画と再生のヘルパー
├─ test/
│  ├─ fixtures/
│  │  ├─ PROVENANCE.json       全fixtureの出どころ（R14）
│  │  ├─ cassettes/            外部APIの録画（Wikipedia／Wikidata／MusicBrainz／syntheticのみ。コミットする）
│  │  ├─ db/                   E2E用のseed
│  │  ├─ texts/                本文のfixture（Wikipediaかsyntheticのみ）
│  │  └─ local/                実サイトの録画（gitignore。手元専用）
│  └─ e2e/
├─ eval/
│  ├─ gold/                    正解リスト（本人が作る。コミットする）
│  ├─ review/                  目視判定のCSV（引用を含むため gitignore）
│  ├─ runs/                    評価の生データ（gitignore）
│  └─ report.md                最新の評価レポート（gitignore）
├─ metrics/
│  ├─ baseline.json            品質の基準値（コミットする）
│  └─ latest.json              最新の値（gitignore）
├─ schema/                     生成した JSON Schema（コミットする）
└─ data/                       SQLite と本文キャッシュ（gitignore）
```

- 単体テストは、対象と同じフォルダに `*.test.ts` として置く。E2Eは `test/e2e/` に置く。
- 新しいフォルダを作る場合は、この章の構成と層のルールに当てはまるかを先に確認する。当てはまらなければ、ADRを書いてからこの章を更新する。

## 指示ファイル（AGENTS.md）

[ADR 0016](../decisions/0016-agents-md-hierarchy.md)（openai/codex を参考にした）

- ルートの `AGENTS.md` が正。`CLAUDE.md` には `@AGENTS.md` の1行だけを書く。Codex など他のエージェントでも、同じルールを読めるようにするため。
- ルートの `AGENTS.md` に書くのは、次の4つだけ（50行以内）:
  1. 最初に SPEC.md を読み、目次の「読むとき」に従って章を読むこと
  2. 主なコマンド（変更した範囲のテスト → `pnpm check`）
  3. 1ステップの流れと、詰まったときのルールへのリンク（[process](process.md)）
  4. 禁止事項（APIキーをコミットしない、`pnpm check` を通さずに完了としない、lintを無効化するコメントを書かない、など）
- 各層の `AGENTS.md` は10行程度に抑え、その層に固有の注意だけを書く（例: domain なら「時刻は引数で受け取る」）。
- lint やテストで強制できることは、指示ファイルに書かずに lint やテストにする。指示ファイルは、機械で強制できないことのためにある。
