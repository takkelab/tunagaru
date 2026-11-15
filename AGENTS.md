# AGENTS.md

このリポジトリでエージェントが守ること。lint・テスト・フックで強制できることは、ここには書かない。

## 1. 最初に読む

- [SPEC.md](SPEC.md) を読み、目次の「読むとき」に従って、作業に関係する章を読む。
- 判断の理由は [docs/decisions/](docs/decisions/README.md) にある。

## 2. 主なコマンド

- 変更した範囲のテスト: `pnpm test <path>`（例: `pnpm test src/domain`）
- 一括検証: `pnpm check`（typecheck → lint → スキーマのずれ検知 → テスト）
- 自動修正: `pnpm fix`
- 一覧は [testing のコマンド一覧](docs/spec/testing.md#コマンド一覧)

## 3. 進め方

- 1ステップ＝1ブランチ（`step/NN-short-name`）＝1PR。流れと完了条件は [process](docs/spec/process.md#1ステップの流れ)。
- 同じエラーで3回失敗したら止まり、[詰まったときの手順](docs/spec/process.md#詰まったときの再発防止)に従う。
- 覆すと手戻りが大きい判断は、ADRを書く（[決定記録](docs/spec/process.md#決定記録adr)）。

## 4. 禁止事項

- `pnpm check` を通さずに「完了」と言わない。通らない条件は、PRに正直に書く。
- APIキーや `.env` をコミットしない。偽のキーもリポジトリに置かない（テストの実行時に作る）。
- Wikipedia・Wikidata・MusicBrainz と synthetic（自分で書いた架空の文章）以外の本文を、どの形でもコミットしない（[ADR 0019](docs/decisions/0019-public-repository-safeguards.md)）。
- lint を無効にするコメント（`biome-ignore` など）を、理由なしに書かない。
- フック・lint・閾値を弱める変更や `--no-verify` を、ADRなしで行わない。
- 外部に公開する操作（リポジトリの作成、push、PR の作成）や、課金が発生する実API呼び出しは、本人の確認なしに行わない。
- PR をマージしない（マージは本人が行う）。
