# src/adapters

ポートの実装を置く層（[architecture](../../docs/spec/architecture.md#層と依存の向き)）。

- 外部APIのクライアントは、コンストラクタで `fetchImpl` を受け取る。テストでは `tools/cassette` の再生用 fetch を渡す。
- cassette の録画は `pnpm cassette:record` で行い、手で秘密情報を消そうとしない（録画時に自動で除去される）。
- Wikipedia・Wikidata・MusicBrainz 以外のサイトのテストには、自分で書いた架空のHTMLを使う（[testing](../../docs/spec/testing.md#fixtureの出どころ)）。
- 追加したfixtureは、`test/fixtures/PROVENANCE.json` に出どころを登録する。
