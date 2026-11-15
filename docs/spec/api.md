# API

サーバーは Hono を使い、`127.0.0.1:8787` にのみbindする（外部には公開しない）。
リクエストとレスポンスの Zod スキーマは `src/shared/contract/` に置き、server・web・cli で共有する。

## 共通

- 形式はJSON、文字コードはUTF-8。
- IDは `ent_…`（entity）、`wrk_…`（work）、`edg_…`（edge）、`evi_…`（evidence）、`job_…`（job）とする。
- 一覧はカーソル方式のページングにする（`?limit=&cursor=`）。レスポンスに `nextCursor` を含める。
- 統合済み（`redirect_to` がある）の entity を指定した場合は、統合先の内容を返し、`redirectedFrom` を含める。
- エラーは次の形で返す。

  ```json
  { "error": { "code": "budget_exceeded", "message": "今月の残額は12円です（見積もり30円）" } }
  ```

| code                   | HTTP | 発生する場面                                          |
| ---------------------- | ---- | ----------------------------------------------------- |
| `validation`           | 400  | 入力がスキーマに合わない                              |
| `not_found`            | 404  | IDが存在しない                                        |
| `conflict`             | 409  | 自分自身への統合、統合済みの人物の再統合など          |
| `budget_exceeded`      | 402  | 見積もりが予算の残りを超える                          |
| `upstream_unavailable` | 502  | Wikidata・記事のサイト・Anthropicなどの外部が失敗した |

## エンドポイント

| メソッドとパス                           | 説明                                                     | 主な入力                                                                                            | 主な出力                                                                                       |
| ---------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/health`                        | 生存確認                                                 | なし                                                                                                | `{ "ok": true }`                                                                               |
| `GET /api/search`                        | 主体の検索                                               | `q`                                                                                                 | `{ local: Entity[], wikidata: Candidate[] }`                                                   |
| `POST /api/entities`                     | 候補から主体を作る（既存のものがあればそれを返す）       | `{ wikidataQid }` または `{ displayName, kind }`                                                    | `Entity`                                                                                       |
| `GET /api/entities/:id`                  | 主体の詳細                                               | なし                                                                                                | `Entity`（別名、所属、メンバー、起点かどうか、外部リンク）                                     |
| `GET /api/seeds`                         | 起点の一覧                                               | なし                                                                                                | `{ seeds: { entity, likeCount, sourceCount, investigating }[] }`                               |
| `PUT /api/seeds/:entityId`               | 起点に追加する                                           | なし                                                                                                | `Entity`                                                                                       |
| `DELETE /api/seeds/:entityId`            | 起点から外す（線と根拠は残す）                           | なし                                                                                                | `Entity`                                                                                       |
| `GET /api/overlaps`                      | 重なりの一覧（並び順は [data](data.md#重なり) のとおり） | `limit`（既定20、最大50）, `cursor`, `includePastLike?`                                             | `{ overlaps: OverlapCard[], nextCursor, totalCount }`                                          |
| `GET /api/entities/:id/shelf`            | 起点の棚                                                 | `limit`, `cursor`, `includePastLike?`                                                               | `{ items: ShelfItem[], sources: SourceSummary[], nextCursor }`                                 |
| `GET /api/edges/:id`                     | 線と根拠（前後の文脈つき）                               | なし                                                                                                | `EdgeDetail`                                                                                   |
| `PATCH /api/edges/:id`                   | 確認・却下                                               | `{ status: "approved" \| "rejected", reason? }`                                                     | `EdgeDetail`                                                                                   |
| `PATCH /api/evidence/:id`                | 根拠の作品を確定する                                     | `{ workId }` または `{ wikidataQid }`                                                               | `EdgeDetail`                                                                                   |
| `GET /api/works/:id`                     | 作品の詳細                                               | なし                                                                                                | `Work`（作り手と役割、挙げた起点、外部リンク、気になるかどうか）                               |
| `PUT /api/works/:id/mark`                | 「気になる」を付ける・外す                               | `{ curious: boolean }`                                                                              | `Work`                                                                                         |
| `GET /api/works/curious`                 | 気になる作品の一覧                                       | `limit`, `cursor`                                                                                   | `{ works: Work[], nextCursor }`                                                                |
| `POST /api/investigations`               | 調査ジョブを作る                                         | `{ entityId, sources: Source[], model? }`                                                           | 202 `{ jobId, estimateJpy, remainingJpy }`                                                     |
| `GET /api/investigations/:id`            | ジョブの状態                                             | なし                                                                                                | `{ state, stage, droppedQuotes, newEdges, newOverlaps, costJpy, error? }`                      |
| `GET /api/queues/resolution`             | 名寄せ待ちの一覧                                         | `limit`, `cursor`                                                                                   | `{ items: { edge, rawName, candidates }[] }`                                                   |
| `POST /api/edges/:id/resolve`            | 名寄せ待ちの相手を確定する                               | `{ entityId, addAlias? }`、`{ createLocal: { displayName, kind } }`、`{ discard: true }` のいずれか | `EdgeDetail`                                                                                   |
| `POST /api/entities/:id/merge`           | `:id` を `into` に統合する（ステップ10）                 | `{ into }`                                                                                          | 統合先の `Entity`                                                                              |
| `GET /api/budget`                        | 当月の予算                                               | なし                                                                                                | `{ month, limitJpy, settledJpy, reservedJpy, remainingJpy, rate, avgPerJobJpy, cacheHitRate }` |
| `GET /api/settings`、`PUT /api/settings` | 設定                                                     | `{ model, jpyPerUsd, monthlyLimitJpy, showPastLike, bookLink, musicLink }`                          | 同じ                                                                                           |

`OverlapCard` は次の形。

```text
{ creator: Entity, seedCount, approvedSeedCount, evidenceCount,
  rows: [{ seed: Entity, edgeId, status, works: { workId?, title }[], snippet, sourceUrl, startSec? }],
  entryWorks: Work[] }   // entryWorks は、作品が1つも挙がっていないときの「入口の候補」
```

`Source` は次のいずれか。

```text
{ kind: "url", url }
| { kind: "paste", text, label?, url? }
| { kind: "transcript", videoUrl, text }      // 動画の文字起こし（data: 文字起こし）
| { kind: "search", maxQueries }              // ステップ8
| { kind: "wikipedia", lang: "ja" | "en" }    // ステップ10
```

調査は非同期で行う。webは `GET /api/investigations/:id` を1秒間隔でポーリングする（SSEは使わない。単純さを優先する）。

## CLI

CLI（`src/cli/`）は、server と同じ `src/app/` のユースケースを直接呼ぶ。HTTPは経由しない。

| コマンド                                                         | 説明                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm cli search <q>`                                            | 検索する                                                      |
| `pnpm cli seed <name or QID>`                                    | 起点に追加する                                                |
| `pnpm cli investigate <name or QID> --source <kind> [--dry-run]` | 調査する。`--dry-run` ではLLMを呼ばずに見積もりだけを表示する |
| `pnpm cli extract --source <kind> <url or file> --dry-run`       | 抽出器の単体での確認                                          |
| `pnpm cli overlaps`                                              | 重なりの一覧を表示する                                        |
| `pnpm cli budget`                                                | 当月の使用額と残額を表示する                                  |

## 契約とスキーマのずれ検知

[ADR 0018](../decisions/0018-schema-generation-and-snapshots.md)

- `pnpm gen:schema` を実行すると、`src/shared/contract/` の Zod スキーマから `schema/*.json`（JSON Schema）を生成する。生成物はコミットする。
- `pnpm check` では `tools/schema --check` を実行する。生成結果とコミット済みファイルに差分があれば失敗し、`pnpm gen:schema` を実行するように表示する。
- LLMの構造化出力のスキーマ（[data: 引用照合](data.md#引用照合)）も同じ仕組みで管理する。スキーマを変えた差分がPRに必ず現れるようにするため。
- server の契約テスト: 全エンドポイントについて、正常系とエラー系のレスポンスが contract のスキーマに合うことを確かめる（[testing](testing.md)）。
