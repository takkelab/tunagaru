# src/app

ユースケースとポート（インターフェース）を置く層（[architecture](../../docs/spec/architecture.md#層と依存の向き)）。

- 外部とのやり取りは、`src/app/ports/` にインターフェースを定義してから使う。実装は adapters に置く。
- テストでは、ポートのフェイク（メモリ上のrepo、決まった値を返すLLM）を使う。
- LLM や有料APIを呼ぶユースケースは、呼ぶ前に予算を予約する（[data: 予算](../../docs/spec/data.md#予算)）。
