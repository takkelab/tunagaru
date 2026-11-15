# src/domain

純粋なロジックだけを置く層（[architecture](../../docs/spec/architecture.md#層と依存の向き)）。

- 時刻・乱数・ID は引数で受け取る。現在時刻が必要なら、呼び出し側（app）が `Clock` から取って渡す。
- 失敗は例外より戻り値（判別できる union 型）で表す。照合や判定の理由を呼び出し側が表示できるようにするため。
- 表形式のテスト（`it.each`）を多めに書く。カバレッジの閾値は90%（[metrics](../../docs/spec/metrics.md#コードの健全性)）。
