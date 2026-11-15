# src/web

React の UI（[screens](../../docs/spec/screens.md)）。

- サーバーとのやり取りは API 経由だけにし、型は `src/shared/contract` から使う。
- 見た目と操作は E2E（`test/e2e/`、`pnpm e2e`）で確かめる。fixture DB を使い、外部APIは呼ばない。
- グラフの表現ルール（破線＝未確認、実線＝承認済みなど）は screens の章に従う。
