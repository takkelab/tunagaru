# 決定記録（ADR）

判断の理由を残す場所です。どんなときに書くかは [process](../spec/process.md#決定記録adr) を参照してください。

## テンプレート

ファイル名は `NNNN-kebab-case-title.md` とします（番号は連番）。

```markdown
# NNNN タイトル

- 状態: 提案 | 採用 | 却下 | 置換（→ NNNN）
- 日付: YYYY-MM-DD

## 背景

なぜ判断が必要になったか。制約と前提。

## 決定

何を決めたか。

## 検討した代替案

- 案A: 採らなかった理由
- 案B: 採らなかった理由

## 結果とトレードオフ

この決定で得るもの、失うもの、注意すべきリスク。関係する仕様の章へのリンク。
```

## 一覧

| #                                                        | タイトル                                                    | 状態                           |
| -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| [0001](0001-personal-local-web-app.md)                   | 個人用ローカルWebアプリにする                               | 採用                           |
| [0002](0002-hybrid-sources-and-definition-of-like.md)    | データ源はハイブリッド、「好き」は本人の公言に限る          | 採用                           |
| [0003](0003-explicit-trigger-and-persistent-cache.md)    | 抽出は明示ボタンで起動し、結果を永続キャッシュする          | 採用                           |
| [0004](0004-quote-verification-and-unverified-edges.md)  | 引用照合をして、未確認の線は破線で表示する                  | 採用                           |
| [0005](0005-entity-resolution-by-wikidata-qid.md)        | 名寄せはWikidata QIDを正とし、統合は手動で行う              | 採用                           |
| [0006](0006-source-and-model-selection-by-evaluation.md) | 本文ソースとモデルは、Haikuを使った評価で比較して決める     | 提案                           |
| [0007](0007-monthly-budget-500-yen.md)                   | 予算は月500円のハード上限とし、費用削減策を必須にする       | 採用                           |
| [0008](0008-expanding-canvas-forward-only.md)            | 展開型キャンバスで、表示は順方向のみ                        | 採用                           |
| [0009](0009-works-as-attributes-groups-as-nodes.md)      | 作品は属性、グループは別ノード                              | 採用                           |
| [0010](0010-classify-and-hide-negative-statements.md)    | 否定は分類して保存し、表示はしない                          | 採用                           |
| [0011](0011-typescript-stack.md)                         | TypeScript一本の技術スタック                                | 採用                           |
| [0012](0012-single-package-layered-folders.md)           | 単一パッケージ＋層フォルダ＋composition root                | 採用                           |
| [0013](0013-lint-toolchain.md)                           | Biome＋dependency-cruiser＋独自lint＋markdownlint           | 採用                           |
| [0014](0014-git-hooks-and-ci.md)                         | git＋Claude Codeのフック＋lefthook＋GitHub Actions          | 採用（公開範囲は 0019 で変更） |
| [0015](0015-record-replay-for-external-apis.md)          | 外部APIのテストは録画再生、liveは手元でのみ実行する         | 採用                           |
| [0016](0016-agents-md-hierarchy.md)                      | AGENTS.mdを正とし、ディレクトリごとに指示ファイルを置く     | 採用                           |
| [0017](0017-step-branch-pr-and-mechanical-prevention.md) | 1ステップ＝1ブランチ＝1PR、再発防止は機械的な対策を優先する | 採用                           |
| [0018](0018-schema-generation-and-snapshots.md)          | スキーマ生成とずれ検知、スナップショットテスト              | 採用                           |
| [0019](0019-public-repository-safeguards.md)             | リポジトリを公開し、著作物と秘密情報の流出を機械的に防ぐ    | 採用                           |
| [0020](0020-harness-implementation-details.md)           | ハーネスの実装上の細かな決定                                | 採用                           |
| [0021](0021-main-branch-protection.md)                   | main をブランチ保護し、CIの通過を必須にする                 | 採用                           |
