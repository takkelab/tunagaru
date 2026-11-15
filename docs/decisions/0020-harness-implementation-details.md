# 0020 ハーネスの実装上の細かな決定

- 状態: 採用
- 日付: 2026-11-15

## 背景

ステップ1でハーネスを作る際に、仕様に書かれていない、あるいは仕様のとおりには実現できない点がいくつかあった。どれも後から変えられるが、黙って決めると理由が残らないため、まとめて記録する。

## 決定

1. **TypeScript は 6.0 系に固定する**。2026年11月時点の最新は 7.0（ネイティブ実装）だが、dependency-cruiser などのツールが使う TypeScript の JS API との互換性を確かめられていない。ツール側の対応を確認できたら、新しいADRで 7 系に上げる。
2. **gitleaks は npm にないため、`tools/secrets/gitleaks.mjs` が公式のリリースをダウンロードする**。バージョンとプラットフォームごとの SHA-256 をスクリプトに固定し、一致しなければ中断する。`pnpm install` の `postinstall` で取得するので、`pnpm test` はネットワークなしで動く。
3. **`pnpm lint:arch` は `tools/lint/arch.mjs` を経由する**。dependency-cruiser は違反の件数を終了コードにするため、0か1にそろえ、ルールの説明（`comment`）も表示する。
4. **`pnpm test` は `tools/scripts/test.mjs` を経由する**。パスで絞らない実行のときだけカバレッジの閾値をかける。`pnpm test src/domain` のように絞ったときは、対象外のファイルのカバレッジで落ちないようにする。
5. **R8 の `Math.random` は、Biome の GritQL プラグイン（`tools/lint/biome/no-math-random.grit`）で検出する**。`noRestrictedGlobals` はグローバル変数単位でしか禁止できず、`Math` ごと禁止すると `Math.max` も使えなくなるため。`process.env` は `noProcessEnv` で検出する。composition root（`main.ts`）では `process.argv` などを使えるよう、`process` そのものは domain でだけ禁止する。
6. **R14 の cassette の許可リスト**: synthetic の cassette に限り、予約済みの架空ドメイン（`example.com`、`*.example`、`*.test`、`*.invalid`）を使ってよい。URL取得アダプタのテストで架空のHTMLを返すため。
7. **R14 の Anthropic の入力本文の照合**: Anthropic に送る本文は `<document>…</document>` で囲む。cassette の `PROVENANCE.json` の項目に `input`（登録済みの Wikipedia か synthetic の本文fixture）を書き、`<document>` の中の段落がすべてその本文に含まれることを検査する。プロンプトの定型文と本文を区別するため（ステップ3のプロンプトはこの形に従う）。
8. **Stop フックの3回目**: 止めずに終了コード0を返し、`systemMessage` で incident を書くよう知らせる。2回目に止めるときにも、「次は止めない。直せなければ incident を書く」と伝える。3回目の時点では Claude が作業を終えるため。
9. **TypeScript のツールとスキーマ生成は、Node の型除去（Node 22.18 以上）でそのまま実行する**。ビルド手順を増やさないため。そのため、相対 import には `.ts` の拡張子を付ける。

## 検討した代替案

- TypeScript 7.0 をそのまま使う: 型チェックは速いが、ツールの互換性の確認に時間がかかる。
- gitleaks を各自の環境に手で入れる: CI と手元でバージョンがずれ、入れ忘れると検査が黙って効かなくなる。
- `Math.random` を独自lintで検出する: Biome のプラグインなら、エディタ上でも同じ診断が出る。

## 結果とトレードオフ

- gitleaks のバージョンを上げるときは、スクリプトの SHA-256 も更新する必要がある。
- Anthropic の cassette を録画するテストでは、本文を `<document>` で囲む形に縛られる（[testing](../spec/testing.md#fixtureの出どころ)、[architecture R14](../spec/architecture.md#lintで強制する設計ルール)）。
