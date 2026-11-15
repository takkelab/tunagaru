# 0012 単一パッケージ＋層フォルダ＋composition root

- 状態: 採用
- 日付: 2026-11-15

## 背景

「domain は DB や API を import しない」といった境界を守らせたい。ただし、個人開発で設定やビルドの手間は増やしたくない。

## 決定

単一の pnpm パッケージの中を、`domain`／`app`／`adapters`／`shared`／`server`／`web`／`cli` のフォルダに分ける。依存の向きは dependency-cruiser で強制する。adapters を組み立てるのは `server/main.ts` と `cli/main.ts`（composition root）だけにする（[architecture](../spec/architecture.md#層と依存の向き)）。

## 検討した代替案

- pnpm workspace でパッケージを分割する: 境界は最も強いが、設定とビルドの手間が増える。
- 機能ごとのフォルダ: 機能単位でまとまるが、層のルールを別途作る必要がある。

## 結果とトレードオフ

- 境界は lint でしか守られないため、lintルールが効いていることをfixtureのテストで保証する。
