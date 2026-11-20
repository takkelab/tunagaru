# データ

DBはSQLite（better-sqlite3＋Drizzle）。DBを触ってよいのは `src/adapters/db/` だけ（[architecture](architecture.md#lintで強制する設計ルール)）。
列挙値と、正規化・照合・重なりの計算・予算計算の純粋なロジックは `src/domain/` に置く。

## テーブル

| テーブル         | 主な列                                                                                                                                                                                                      | 説明                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `entity`         | `id`, `kind`（`person`／`group`）, `wikidata_qid?`, `musicbrainz_id?`, `display_name`, `description?`, `seed_at?`, `redirect_to?`, `created_at`                                                             | 主体（人物・グループ）。`seed_at` があれば起点（本人の好きな人）。統合された側は `redirect_to` で統合先を指す             |
| `alias`          | `entity_id`, `name`, `lang`                                                                                                                                                                                 | 別名（表記揺れ、ペンネーム、各言語の名前、自動字幕の誤記）                                                                |
| `membership`     | `group_id`, `person_id`, `role?`                                                                                                                                                                            | グループの所属                                                                                                            |
| `work`           | `id`, `title`, `wikidata_qid?`, `created_at`                                                                                                                                                                | 作品。ノードにはしないが、独立した記録として持つ（[ADR 0023](../decisions/0023-works-as-records-overlaps-by-creator.md)） |
| `work_creator`   | `work_id`, `entity_id`, `role`（`author`／`lyricist`／`composer`／`performer`／`director`）                                                                                                                 | 作品と作り手の多対多                                                                                                      |
| `work_mark`      | `work_id`, `created_at`                                                                                                                                                                                     | 本人が「気になる」を付けた作品。マークはこの1種類だけ（[ADR 0022](../decisions/0022-overlaps-of-seed-people-as-core.md)） |
| `source_doc`     | `id`, `kind`（`url`／`paste`／`transcript`／`wikipedia`）, `url?`, `video_id?`, `found_by`（`manual`／`search`）, `title?`, `lang`, `content_hash`, `text_path`, `timeline_path?`, `fetched_at`             | 抽出に使った本文。全文は `text_path` のファイルにのみ保存する。`transcript` は動画の文字起こしで、`url` は動画のURL       |
| `edge`           | `id`, `subject_id`, `object_id`, `polarity`, `attribution`, `status`, `origin`（`wikidata`／`llm`／`manual`）, `created_at`, `updated_at`                                                                   | 「subjectがobjectを好き」という線                                                                                         |
| `evidence`       | `id`, `edge_id`, `source_doc_id`, `span_start`, `span_end`, `quote`（最大200字）, `quote_hash`, `match`（`exact`／`fuzzy`）, `start_sec?`, `work_id?`, `work_title_raw?`, `translation?`, `object_name_raw` | 線の根拠。`quote` は**本文側の文字列**で、`span_start`〜`span_end` は本文中の位置。1本の線に複数あってよい                |
| `rejection_key`  | `subject_id`, `object_id`, `quote_hash`, `reason?`, `created_at`                                                                                                                                            | 却下の記録。再抽出で線が復活しないように使う                                                                              |
| `extraction_run` | `id`, `source_doc_id`, `model`, `prompt_version`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `cost_usd`, `dropped_quote_count`, `fuzzy_match_count`, `created_at`                              | LLM呼び出し1回分の記録                                                                                                    |
| `job`            | `id`, `entity_id`, `sources_json`, `state`（`queued`／`running`／`done`／`failed`／`budget_exceeded`）, `estimate_usd`, `error?`, `created_at`, `updated_at`                                                | 調査ジョブ                                                                                                                |
| `cost_ledger`    | `id`, `job_id?`, `run_id?`, `kind`（`llm`／`search`）, `usd`, `state`（`reserved`／`settled`／`released`）, `created_at`                                                                                    | 費用の予約と確定                                                                                                          |

`entity.id` は `ent_` の後にULIDをつけた形式とする。QIDはIDにせず、列として持つ（ローカル人物とWikidataの人物を同じ扱いにするため）。`work.id` は `wrk_` の後にULIDをつける。

## 列挙値

### polarity（極性）

| 値                 | 意味               | 一覧と棚に出すか                   |
| ------------------ | ------------------ | ---------------------------------- |
| `likes`            | 好き、愛読、ファン | 出す                               |
| `influenced_by`    | 影響を受けた       | 出す                               |
| `past_like`        | 昔は好きだった     | 既定では出さない（設定で切り替え） |
| `dislikes`         | 嫌い、苦手         | 出さない                           |
| `denies_influence` | 影響を否定している | 出さない                           |

### 「好き」にするもの・しないもの

[ADR 0026](../decisions/0026-sensibility-shelf-first-and-wider-likes.md)。抽出のプロンプトに書き、プロンプトのスナップショットで固定する。

- 対象は、本・音楽・映画・マンガの作り手。映画は監督、マンガは作者への線にし、作品を根拠に添える。
- 記事の企画で本人が選んだ曲（プレイリスト、選曲）は `likes` にする。
- 一緒に仕事をした相手（共演者、監督、プロデューサーなど）を褒めるだけの発言は、抽出しない。仕事をする前から好きだったと分かる発言（「昔から」「ファンで」「憧れていた」など）は `likes` にする。
- 人柄を褒める発言（「相方の好きなところ」など）は、抽出しない。

### attribution（発言者）

| 値            | 意味                                                    |
| ------------- | ------------------------------------------------------- |
| `self`        | 本人の発言（インタビュー、エッセイ、動画、SNSなど）     |
| `third_party` | 第三者による記述（Wikipediaの地の文、評論家の指摘など） |

### status（状態）

| 値                   | 意味                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `unverified`         | 引用照合は通ったが、本人が未確認。「未確認」の表示つきで一覧と棚に出す |
| `approved`           | 本人が確かめた。`origin = wikidata` の線は取り込み時にこの状態になる   |
| `rejected`           | 本人が却下した。表示しない                                             |
| `pending_resolution` | 相手の主体が1人に確定していない。表示しない（S7で確定する）            |

## 引用照合

[ADR 0024](../decisions/0024-locate-quotes-in-source-and-video-transcripts.md)

LLMの出力は、構造化出力で次の形に固定する（スキーマは `src/shared/contract/` で管理し、[スキーマのずれ検知](api.md#契約とスキーマのずれ検知)の対象にする）。

```text
{ statements: [{ subject_name, object_name, polarity, attribution, quote, work_title?, translation? }] }
```

- `quote` は、本文から**そのまま抜き出した**部分であるように指示する。ただし照合では、`quote` を「本文中の位置を探す手がかり」として扱う。
- 照合の手順:
  1. 本文と `quote` の両方を正規化する（下の1〜4）。
  2. 正規化後の `quote` が、正規化後の本文の部分文字列なら、その範囲を使う（`match = exact`）。
  3. 見つからなければ、あいまい一致で探す。正規化に5を加え、`quote` と長さの近い本文の範囲（`quote` の長さの±20%）のうち、類似度が最も高いものを選ぶ。類似度は `1 − 編集距離 ÷ quote の長さ` とする。
  4. あいまい一致で通すのは、類似度が閾値（初期値0.85）以上で、**かつ**その範囲に `object_name` か、その別名が含まれる場合だけ（`match = fuzzy`）。
  5. どちらでも見つからなければ破棄し、`extraction_run.dropped_quote_count` に数える。
- 保存と表示に使うのは、見つかった範囲の**本文側の文字列**（正規化前）と、その位置（`span_start`、`span_end`）。LLMの `quote` は保存しない。
- 正規化:
  1. Unicode NFKC（全角英数字を半角にし、半角カナを全角にする）
  2. 連続する空白と改行を1つの空白にまとめ、前後を削る
  3. 引用符の統一（`“ ” „ « » 「 」 『 』 ' '` を区別しない比較用の文字にする。照合用の内部表現でのみ行う）
  4. ダッシュ類（`— – ― ー -`）の統一。ただし長音記号 `ー` は、カタカナの直後にあるときは変えない
  5. （あいまい一致のときだけ）カタカナをひらがなにそろえる。自動字幕の「吉本バナナ」のような揺れを吸収するため
- 正規化前と正規化後の位置の対応表を作り、正規化後の位置から本文の位置に戻せるようにする。
- 閾値と範囲の幅は `src/domain/` の定数とし、表形式のテストで固定する。
- 訳文（`translation`）は表示用で、照合には使わない。英語の記事の引用は、英語のまま照合・保存する。
- 範囲が200字を超える場合は、照合は全文で行い、保存と表示は200字で切る。
- `quote_hash` は、保存する本文側の文字列を正規化したもののSHA-256とする。

## 文字起こし

[ADR 0024](../decisions/0024-locate-quotes-in-source-and-video-transcripts.md)。試作品のあと、ステップ12で実装する（[ADR 0026](../decisions/0026-sensibility-shelf-first-and-wider-likes.md)）。

- 入力は、動画のURLと、YouTube の「文字起こしを表示」からコピーした文字列。
- タイムスタンプの行（`0:00`、`12:34`、`1:02:03` の形）と、その後に続く発言の行を組にして読む。タイムスタンプのない行は、直前の組の発言に続けてつなぐ。1行が「`0:16`」「`16 秒`」「発言」の連結になっている形（コピーのしかたによって起きる。試作Bで確認）も読む。
- 本文は、発言だけを改行でつないだものにする（`text_path` に保存する）。タイムスタンプは、「本文中の開始位置 → 秒」の対応表として `timeline_path`（`data/texts/<content_hash>.timeline.json`）に保存する。
- 根拠の `start_sec` は、`span_start` を含む組の秒とする。根拠のリンクは、動画のURLに `t=<start_sec>s` を付けたものにする。
- `video_id` は、動画のURL（`youtube.com/watch?v=`、`youtu.be/` など）から取り出す。取り出せなければ、タイムスタンプのリンクは作らず、URLだけを出す。
- タイムスタンプを1つも読み取れなかった場合は、`paste` として扱う（照合と抽出はできるが、再生位置は出ない）。

## 名寄せ

[ADR 0005](../decisions/0005-entity-resolution-by-wikidata-qid.md)

### 主体

1. LLMが返す相手は名前（`object_name`）だけ。
2. ローカルDBの `alias` で、正規化後の名前と完全一致するものを探す。1件に決まれば確定とする。
3. 決まらなければ、Wikidataの `wbsearchentities` を日本語と英語で検索する。職業（作家・音楽家など）で絞り込み、1件に決まれば確定とする。
4. それでも決まらなければ、線を `pending_resolution` にして、S7で本人に選んでもらう。
5. 自動では**統合しない**。

- ソロプロジェクトの名義は、グループの主体を作らず、本人の `alias` に登録する（[ADR 0023](../decisions/0023-works-as-records-overlaps-by-creator.md)）。別名は S4 から追加でき、追加したときは `pending_resolution` の線のうち、その別名に一致するものを確定する。

### 作品

[ADR 0023](../decisions/0023-works-as-records-overlaps-by-creator.md)

1. 作品名（`work_title`）だけでは決めない。相手の主体が確定してから行う。
2. ローカルDBで、その主体を作り手に持ち、正規化後の題名が一致する作品があれば、それを使う。
3. なければ、作品名で Wikidata を検索し、作り手（P50 著者、P676 作詞者、P86 作曲者、P175 演奏者、P57 監督）がその主体である候補に絞る。マンガの作者は P50 で取る。1件に決まれば作品を作る。
4. 決まらなければ、作品のない根拠として保存し、`work_title_raw` に作品名を残す（線そのものは作る）。作品の確定は、後でS4から行える。

### 統合（merge）

統合元Aを統合先Bに統合するときの手順（ステップ10で実装する）:

- Aの `edge`（subjectでもobjectでも）、`alias`、`membership`、`work_creator`、`rejection_key` をBに付け替える。`seed_at` は、どちらかにあれば早い方をBに残す。
- 付け替えで重複した線は1本にまとめ、根拠を合算する。状態は `approved` ＞ `unverified` の順に優先する。ただし、`rejected` が1つでもあれば `rejected` にする。
- Aは削除せず、`redirect_to = B` にする。Aを参照するAPIは、Bにリダイレクトした結果を返す。
- 1トランザクションで行う。

## 却下の維持

- 線を却下すると、その線の根拠ごとに `rejection_key(subject, object, quote_hash)` を記録する。
- 再抽出で同じキーの線が出た場合は、`rejected` のまま根拠を追加する。
- 却下済みの線に、別の引用（別の `quote_hash`）の根拠が新しく見つかった場合は、`unverified` に戻して再確認に回す。線の数を増やしたいからではなく、新しい根拠がある以上、判断し直す価値があるため。

## キャッシュ

- 本文は `data/texts/<content_hash>.txt` に保存する（gitignore）。`content_hash` は、正規化前の本文のSHA-256とする。文字起こしでは、タイムスタンプを除いた本文のハッシュとする。
- 抽出のキャッシュキーは `content_hash × model × prompt_version`。同じキーの `extraction_run` があれば、LLMを呼ばずに再利用する。
- `prompt_version` は、プロンプトの定義ファイルの内容ハッシュとする（プロンプトの全文はスナップショットテストの対象にする。[testing](testing.md#スナップショット)）。
- 同じURLの記事は、`fetched_at` から30日以内なら再取得しない。Wikipediaは、同じ版（revision id）なら再取得しない。

## 事前フィルタ

LLMに送る前に、本文から次の語を含む段落と、その前後1段落だけを抜き出す。文字起こしでは、語を含む発言の組の前後60秒に入る組をすべて抜き出す（字幕の1行は数秒分しかなく、話が何行にもまたがるため）。語の一覧は `src/domain/` に定数として持ち、テストで固定する。

- 日本語: 影響, 好き, 愛読, 憧れ, ファン, 敬愛, 尊敬, 心酔, 傾倒, 夢中, 聴いて, 読んで, 観て, ベスト, 愛聴, 選曲, プレイリスト
- 英語: influence, influenced, favorite, favourite, fan of, admire, inspired, idol, hero, love, loved

該当する段落がなければ、LLMを呼ばずに「抽出0件」で終える（費用ゼロ）。

## 重なり

[ADR 0022](../decisions/0022-overlaps-of-seed-people-as-core.md)

- **数える線**: `status` が `approved` か `unverified` で、`polarity` が `likes` か `influenced_by` の線（設定で `past_like` も含められる）。
- **重なりの数**: ある作り手に、数える線を持っている起点の人数。2以上の作り手を「重なり」とする。起点自身が作り手の場合（起点Aが起点Bを好き）も含める。
- **確認の数**: 重なりの数のうち、その起点からの線が `approved` である人数。カードに「確認 1/2」のように出す。
- **重なりの並び順**:
  1. 重なりの数の降順
  2. 確認の数の降順
  3. 根拠の数の降順
  4. 表示名の昇順（決定的にするため）
- **棚の並び順**（起点ごとの好きなもの）: `approved` を先に、次に根拠の数の降順、最後に表示名の昇順。
- **重なりのカードの作品**: 各起点の根拠に付いている作品（`work_id` か `work_title_raw`）を、起点ごとに並べる。作品が1つもなければ、Wikidata の代表作（P800）を最大3件まで、「入口の候補」として根拠とは分けて出す。
- 並び順の規則は `src/domain/` に置き、単体テストで固定する。

## 予算

[ADR 0007](../decisions/0007-monthly-budget-500-yen.md)

- 月の上限は円で設定する（初期値は500円）。為替レートも設定値にする（初期値は150円/$）。
- 見積もりは次の式で出す。単価はモデルの設定値に持つ。

  ```text
  事前フィルタ後のトークン数 × 入力単価 + 出力の上限トークン数 × 出力単価 + 検索回数 × 検索単価
  ```

- 「当月」はローカル時刻（Asia/Tokyo）で区切る。
- 完了したら、実費を `settled` として記録する。失敗した場合も、それまでの実費は記録する。

### 試作品での扱い（ステップ5）

[ADR 0025](../decisions/0025-prototype-first-then-auto-investigation.md)

- ジョブは1つずつ順に実行する（並行させない）。
- ジョブを開始する前に、次の条件を確かめる。満たさないジョブは `budget_exceeded` として開始しない。

  ```text
  当月のsettled合計 + 今回の見積もり <= 上限
  ```

### 並行ジョブでの扱い（ジョブを並行させるときに入れる）

- ジョブを開始する前に、見積もり額を `cost_ledger(state=reserved)` として予約する。判定の式に当月の `reserved` 合計を加える。
- 予約と判定は、1トランザクション（SQLiteの `BEGIN IMMEDIATE`）で行う。並行ジョブで上限を超えないようにするため。
- 完了したら、予約は `released` にする。
