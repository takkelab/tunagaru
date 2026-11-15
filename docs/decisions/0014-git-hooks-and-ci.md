# 0014 git＋Claude Codeのフック＋lefthook＋GitHub Actions

- 状態: 採用（リポジトリの公開範囲は [0019](0019-public-repository-safeguards.md) で「公開」に変更）
- 日付: 2026-11-15

## 背景

実装は Claude Code が主に担う。本人が見ていないときにも、壊れた状態で「完了」とさせない仕組みが必要。

## 決定

- Claude Code の Stop フック: `pnpm check` が通らなければ、作業を終わらせない。同じ失敗の3回目では止めるのをやめ、incident を書くよう指示する（無限ループの防止）。
- PostToolUse フック: 編集したファイルを自動で整形する。
- lefthook: pre-commit では変更したファイルだけを、pre-push では `pnpm check` 全体を実行する。
- GitHub Actions: `pnpm check` と `pnpm e2e` を Ubuntu と Windows で実行する。実APIは呼ばない。リポジトリは公開とする（[0019](0019-public-repository-safeguards.md)。当初は非公開の予定だった）。

詳細は [process](../spec/process.md#機械による止め方) を参照。

## 検討した代替案

- CIなし: 手元の環境に依存した成功を見逃す。
- 手動のチェックのみ: エージェントが確認を省略しても気づけない。

## 結果とトレードオフ

- Stop フックがあると、セッションの終了が遅くなる（`pnpm check` の時間がかかる）。`pnpm check` は1分以内を目安に保つ。
- GitHub への push は外部への公開になるため、リポジトリを作る前に本人に確認する。公開に伴う対策は [0019](0019-public-repository-safeguards.md) に従う。
