# データ

DBはSQLite（better-sqlite3＋Drizzle）。DBを触ってよいのは `src/adapters/db/` だけ（[architecture](architecture.md#lintで強制する設計ルール)）。
列挙値と、正規化・並び順・予算計算の純粋なロジックは `src/domain/` に置く。

## テーブル

| テーブル         | 主な列                                                                                                                                                       | 説明                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `entity`         | `id`, `kind`（`person`／`group`）, `wikidata_qid?`, `musicbrainz_id?`, `display_name`, `description?`, `redirect_to?`, `created_at`                          | 主体（人物・グループ）。統合された側は `redirect_to` で統合先を指す                                          |
| `alias`          | `entity_id`, `name`, `lang`                                                                                                                                  | 別名（表記揺れ、ペンネーム、各言語の名前）                                                                   |
| `membership`     | `group_id`, `person_id`, `role?`                                                                                                                             | グループの所属                                                                                               |
| `work`           | `id`, `title`, `creator_entity_id`, `role`（`author`／`lyricist`／`composer`／`performer`）, `wikidata_qid?`                                                 | 作品。ノードにはせず、属性として持つ（[ADR 0009](../decisions/0009-works-as-attributes-groups-as-nodes.md)） |
| `source_doc`     | `id`, `kind`（`wikipedia`／`url`／`paste`／`search`）, `url?`, `lang`, `content_hash`, `text_path`, `fetched_at`                                             | 抽出に使った本文。全文は `text_path` のファイルにのみ保存する                                                |
| `edge`           | `id`, `subject_id`, `object_id`, `polarity`, `attribution`, `status`, `origin`（`wikidata`／`llm`／`manual`）, `created_at`, `updated_at`                    | 「subjectがobjectを好き」という線                                                                            |
| `evidence`       | `id`, `edge_id`, `source_doc_id`, `quote`（最大200字）, `quote_hash`, `work_id?`, `translation?`, `object_name_raw`                                          | 線の根拠。1本の線に複数あってよい                                                                            |
| `rejection_key`  | `subject_id`, `object_id`, `quote_hash`, `reason?`, `created_at`                                                                                             | 却下の記録。再抽出で線が復活しないように使う                                                                 |
| `extraction_run` | `id`, `source_doc_id`, `model`, `prompt_version`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `cost_usd`, `dropped_quote_count`, `created_at`    | LLM呼び出し1回分の記録                                                                                       |
| `job`            | `id`, `entity_id`, `sources_json`, `state`（`queued`／`running`／`done`／`failed`／`budget_exceeded`）, `estimate_usd`, `error?`, `created_at`, `updated_at` | 調査ジョブ                                                                                                   |
| `cost_ledger`    | `id`, `job_id?`, `run_id?`, `kind`（`llm`／`search`）, `usd`, `state`（`reserved`／`settled`／`released`）, `created_at`                                     | 費用の予約と確定                                                                                             |
| `user_mark`      | `entity_id`, `mark`（`like`／`curious`／`tried`／`disliked`）, `updated_at`                                                                                  | 本人のマーク。1人物につき1つ                                                                                 |

`entity.id` は `ent_` の後にULIDをつけた形式とする。QIDはIDにせず、列として持つ（ローカル人物とWikidataの人物を同じ扱いにするため）。

## 列挙値

### polarity（極性）

| 値                 | 意味               | グラフに出すか                     |
| ------------------ | ------------------ | ---------------------------------- |
| `likes`            | 好き、愛読、ファン | 出す                               |
| `influenced_by`    | 影響を受けた       | 出す                               |
| `past_like`        | 昔は好きだった     | 既定では出さない（設定で切り替え） |
| `dislikes`         | 嫌い、苦手         | 出さない                           |
| `denies_influence` | 影響を否定している | 出さない                           |

### attribution（発言者）

| 値            | 意味                                                    |
| ------------- | ------------------------------------------------------- |
| `self`        | 本人の発言（インタビュー、エッセイ、SNSなど）           |
| `third_party` | 第三者による記述（Wikipediaの地の文、評論家の指摘など） |

### status（状態）

| 値                   | 意味                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `unverified`         | 引用照合は通ったが、本人が未承認。破線で表示する                     |
| `approved`           | 本人が承認した。`origin = wikidata` の線は取り込み時にこの状態になる |
| `rejected`           | 本人が却下した                                                       |
| `pending_resolution` | 相手の人物が1人に確定していない。表示しない                          |

## 引用照合

LLMの出力は、構造化出力で次の形に固定する（スキーマは `src/shared/contract/` で管理し、[スキーマのずれ検知](api.md#契約とスキーマのずれ検知)の対象にする）。

```text
{ statements: [{ subject_name, object_name, polarity, attribution, quote, work_title?, translation? }] }
```

- `quote` は、本文から**そのまま抜き出した**部分でなければならない。
- 照合の手順:
  1. 本文と `quote` の両方を正規化する。
  2. 正規化後の `quote` が、正規化後の本文の部分文字列なら通過とする。そうでなければ破棄し、`extraction_run.dropped_quote_count` に数える。
- 正規化:
  1. Unicode NFKC（全角英数字を半角にし、半角カナを全角にする）
  2. 連続する空白と改行を1つの空白にまとめ、前後を削る
  3. 引用符の統一（`“ ” „ « » 「 」 『 』 ' '` を区別しない比較用の文字にする。照合用の内部表現でのみ行う）
  4. ダッシュ類（`— – ― ー -`）の統一。ただし長音記号 `ー` は、カタカナの直後にあるときは変えない
- 訳文（`translation`）は表示用で、照合には使わない。英語の記事の引用は、英語のまま照合・保存する。
- 引用が200字を超える場合は、照合は全文で行い、保存と表示は200字で切る。
- `quote_hash` は、正規化後の引用のSHA-256とする。

## 名寄せ

[ADR 0005](../decisions/0005-entity-resolution-by-wikidata-qid.md)

1. LLMが返す相手は名前（`object_name`）だけ。
2. ローカルDBの `alias` で、正規化後の名前と完全一致するものを探す。1件に決まれば確定とする。
3. 決まらなければ、Wikidataの `wbsearchentities` を日本語と英語で検索する。職業（作家・音楽家など）で絞り込み、1件に決まれば確定とする。
4. それでも決まらなければ、線を `pending_resolution` にして、S7で本人に選んでもらう。
5. 自動では**統合しない**。

### 統合（merge）

統合元Aを統合先Bに統合するときの手順:

- Aの `edge`（subjectでもobjectでも）、`alias`、`membership`、`user_mark`、`rejection_key` をBに付け替える。
- 付け替えで重複した線は1本にまとめ、根拠を合算する。状態は `approved` ＞ `unverified` の順に優先する。ただし、`rejected` が1つでもあれば `rejected` にする。
- Aは削除せず、`redirect_to = B` にする。Aを参照するAPIは、Bにリダイレクトした結果を返す。
- 1トランザクションで行う。

## 却下の維持

- 線を却下すると、その線の根拠ごとに `rejection_key(subject, object, quote_hash)` を記録する。
- 再抽出で同じキーの線が出た場合は、`rejected` のまま根拠を追加する。
- 却下済みの線に、別の引用（別の `quote_hash`）の根拠が新しく見つかった場合は、`unverified` に戻して再レビューに回す。線の数を増やしたいからではなく、新しい根拠がある以上、判断し直す価値があるため。

## キャッシュ

- 本文は `data/texts/<content_hash>.txt` に保存する（gitignore）。`content_hash` は、正規化前の本文のSHA-256とする。
- 抽出のキャッシュキーは `content_hash × model × prompt_version`。同じキーの `extraction_run` があれば、LLMを呼ばずに再利用する。
- `prompt_version` は、プロンプトの定義ファイルの内容ハッシュとする（プロンプトの全文はスナップショットテストの対象にする。[testing](testing.md#スナップショット)）。
- Wikipediaは、同じ版（revision id）なら再取得しない。

## 事前フィルタ

LLMに送る前に、本文から次の語を含む段落と、その前後1段落だけを抜き出す。語の一覧は `src/domain/` に定数として持ち、テストで固定する。

- 日本語: 影響, 好き, 愛読, 憧れ, ファン, 敬愛, 尊敬, 心酔, 傾倒, 夢中, 聴いて, 読んで, ベスト, 愛聴
- 英語: influence, influenced, favorite, favourite, fan of, admire, inspired, idol, hero, love, loved

該当する段落がなければ、LLMを呼ばずに「抽出0件」で終える（費用ゼロ）。

## 並び順

子ノードの並び順は、スコアの降順とする。

```text
score = 100 * 合流数 + 10 * (承認済みなら1) + 出典数 - 50 * (「合わなかった」の人物から来た線なら1)
```

- 合流数: 自分が「好き」にした人物のうち、このノードに順方向の線を持つ人数
- 同点の場合は、表示名の昇順にする（決定的にするため）
- 係数は `src/domain/` の定数とし、単体テストで固定する

## 予算

[ADR 0007](../decisions/0007-monthly-budget-500-yen.md)

- 月の上限は円で設定する（初期値は500円）。為替レートも設定値にする（初期値は150円/$）。
- ジョブを開始する前に、見積もり額を `cost_ledger(state=reserved)` として予約する。次の条件を満たさないジョブは、`budget_exceeded` として開始しない。

  ```text
  当月のsettled合計 + 当月のreserved合計 + 今回の見積もり <= 上限
  ```

- 予約と判定は、1トランザクション（SQLiteの `BEGIN IMMEDIATE`）で行う。並行ジョブで上限を超えないようにするため。
- 完了したら、実費で `settled` を記録し、予約は `released` にする。失敗した場合も、それまでの実費は記録する。
- 見積もりは次の式で出す。単価はモデルの設定値に持つ。

  ```text
  事前フィルタ後のトークン数 × 入力単価 + 出力の上限トークン数 × 出力単価 + 検索回数 × 検索単価
  ```

- 「当月」はローカル時刻（Asia/Tokyo）で区切る。
