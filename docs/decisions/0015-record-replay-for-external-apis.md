# 0015 外部APIのテストは録画再生、liveは手元でのみ実行する

- 状態: 採用
- 日付: 2026-11-15

## 背景

CIで実APIを呼ぶと課金が発生し、結果も毎回変わる。一方、手書きのモックだけでは、本物の応答の形とずれていても気づけない。

## 決定

- 実APIの応答を一度録画して cassette（`test/fixtures/cassettes/`）に保存し、`pnpm test` と CI ではそれを再生する。cassette がない場合は失敗させる。
- 実APIを呼ぶ `pnpm test:live` と `pnpm eval` は手元でのみ実行し、予算の上限を適用する。
- 録画時には秘密情報を除去し、lint で検査する（[testing](../spec/testing.md#録画再生cassette)）。

## 検討した代替案

- 手書きのモックのみ: APIの形が変わっても気づきにくい。
- CIでも実APIを少し呼ぶ: GitHub Secrets の管理が必要になり、予算も消費する。

## 結果とトレードオフ

- 外部の仕様変更は、録画し直したときにしか気づけない。気になったら `pnpm test:live` を実行する。
