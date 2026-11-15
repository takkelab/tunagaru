# 進め方

実装は主に Claude Code が担い、本人がPRをレビューしてマージする。
この章は、**人が見ていなくても品質が崩れない**ための約束事を定める（[ADR 0017](../decisions/0017-step-branch-pr-and-mechanical-prevention.md)）。

## 1ステップの流れ

1. **読む**: SPEC.md を読み、目次の「読むとき」に従って、関係する章と、このステップの[完了条件](#実装の順番と完了条件)を読む。
2. **ブランチを切る**: `step/NN-short-name`（例: `step/01-harness`）。大きすぎる場合は `step/03a-…`、`step/03b-…` のように分ける。分けたときは、この章の完了条件も分けて書き直す。
3. **実装する**: 変更した範囲のテストを、こまめに実行する（`pnpm test <path>`）。
4. **確かめる**: `pnpm check` を実行し、続けてこのステップの完了条件のコマンドを**上から順に全部**実行する。
5. **PRを出す**: 本文には次を含める。
   - 完了条件のチェックリスト（コマンドと結果。出力の抜粋を貼る）
   - `pnpm metrics` の表
   - このステップで書いた・更新したADR
   - 本人に判断してほしいこと（あれば）
   - 末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
6. **レビュー**: 本人がレビューしてマージする。Claude Code はマージしない。

「完了」と言ってよいのは、4の完了条件がすべて通ったときだけ。通らない条件がある場合は、そう書いてPRを出す（隠さない）。

## 機械による止め方

| 仕組み                            | タイミング                        | 内容                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code の Stop フック        | Claude が作業を終えようとしたとき | `node tools/hooks/stop-check.mjs` が `pnpm check` を実行する。失敗したら終了コード2を返し、エラーの要約をstderrに出して作業を続けさせる。同じ失敗で3回止められた場合は、止めるのをやめ、[詰まったとき](#詰まったときの再発防止)の手順に従うよう指示を出す（無限ループの防止） |
| Claude Code の PostToolUse フック | ファイルを編集した直後            | 編集したファイルに `biome check --write` を実行する（整形とimportの整理）                                                                                                                                                                                                     |
| lefthook の pre-commit            | コミットの直前                    | ステージしたファイルに gitleaks、Biome、`tsc`、関係するテスト（`vitest related`）を実行する                                                                                                                                                                                   |
| lefthook の pre-push              | push の直前                       | `pnpm check`                                                                                                                                                                                                                                                                  |
| GitHub Actions                    | push と PR                        | `pnpm install --frozen-lockfile`、`pnpm secrets`、`pnpm check`、`pnpm e2e`（Ubuntu と Windows の2系統）。`permissions` は読み取りのみ、action はSHAで固定する                                                                                                                 |
| GitHub の設定                     | push のとき                       | secret scanning と push protection。forkからのPRのワークフロー実行には承認を必須にする                                                                                                                                                                                        |
| ブランチ保護（main）              | マージのとき                      | CI（Ubuntu と Windows）の通過を必須にし、管理者にも適用する。force push と削除を禁止する（[ADR 0021](../decisions/0021-main-branch-protection.md)）                                                                                                                           |

リポジトリは公開する。著作物と秘密情報を公開しないための対策は [ADR 0019](../decisions/0019-public-repository-safeguards.md) に従う。どれも必須で、外してはいけない。

フックとlintの設定を弱める変更（ルールの削除、閾値の引き下げ、`--no-verify`）は、ADRなしでは行わない。

## 詰まったときの再発防止

### 止まる条件

次のいずれかに当たったら、作業を止める。

- 同じエラー（同じテスト、同じlintルール、同じ型エラー）で**3回**修正に失敗した
- 完了条件を満たすために、仕様（docs/spec）かADRに反する変更が必要になった
- 予算を超える実API呼び出しが必要になった

### 止まったらやること

1. `docs/process/incidents/YYYYMMDD-slug.md` を次のテンプレートで書く。

   ```markdown
   # YYYYMMDD slug
   - ステップ: step/NN-…
   - 症状: （エラーメッセージとコマンド）
   - 試したこと: 1. … 2. … 3. …
   - 原因（分かった範囲で）:
   - 対策の種類: lint / テスト / スクリプト / AGENTS.md / 仕様の変更（本人の判断が必要）
   - 対策の内容と、その種類を選んだ理由:
   - 状態: 対応済み / 本人の判断待ち
   ```

2. 対策は、次の優先順で選ぶ。**上で防げるなら、下は使わない**。
   1. **lintルール**（同じ書き方を二度とできなくする）
   2. **テスト**（同じ壊れ方を検出する）
   3. **スクリプト**（手順を自動化して、間違える余地をなくす）
   4. **AGENTS.md への追記**（機械で強制できないことだけ。1件につき1〜2行）
3. 仕様の変更が必要な場合は、自分で変えずに、PRの本文か報告で本人に判断を求める。
4. 対策を入れたら、incident の状態を「対応済み」にする。

AGENTS.md への追記が増えすぎたら、まとめて lint かテストにできないかを見直す。追記の数は `pnpm metrics` に出す。

## 決定記録（ADR）

[docs/decisions/README.md](../decisions/README.md) にテンプレートと一覧がある。

- **書くとき**:
  - 覆すと手戻りが大きい判断（データモデル、層の構成、外部サービスの選定）
  - スコープの変更
  - ライブラリの追加・置き換え
  - lint・フック・閾値を弱める変更
  - 仕様と実装のどちらかを曲げた判断
- **書かなくてよいとき**: 仕様のとおりに実装しただけのとき、命名や小さなリファクタリング。
- **状態**: `提案` → `採用`、あるいは `却下`。覆すときは、新しいADRを書いて古いADRを `置換（→ NNNN）` にする。古いADRは消さない。
- ADRを書いたら、`docs/decisions/README.md` の一覧に追加する（`tools/lint/docs.mjs` が検査する）。

## 実装の順番と完了条件

どのステップでも、`pnpm check` が終了コード0で終わることを共通の完了条件とする（ステップ1を除く。ステップ1ではそれ自体を作る）。

### ステップ1: ハーネスの土台（`step/01-harness`）

アプリのコードは書かない。「以降のステップを機械的に止められる仕組み」だけを作る。

- **作るもの**:
  - `git init`、`.gitignore`（`data/`、`.env`、`metrics/latest.json`、`node_modules/` など）、`.gitattributes`（改行を LF に統一する）
  - `package.json`（[testing のコマンド一覧](testing.md#コマンド一覧)のscriptsをすべて定義する。中身がまだない機能は、「未実装」と表示して終了コード0で終わるスタブにしてよい）
  - `tsconfig.json`（strict）、`biome.json`（R8・R13 の設定）、`.dependency-cruiser.cjs`（R1〜R7）、`.markdownlint-cli2.jsonc`
  - `vitest.config.ts`（カバレッジの閾値つき）、`playwright.config.ts`（空でも動く最小のテスト1件）
  - `tools/lint/`（`file-length.mjs`、`docs.mjs`、`cassette-secrets.mjs`、`fixture-provenance.mjs`）と、それぞれの `__tests__/` と、違反を仕込んだfixture
  - `test/fixtures/PROVENANCE.json`（最初は空の登録簿）、`.gitleaks.toml`
  - `.gitignore` に `test/fixtures/local/`、`eval/review/`、`eval/runs/`、`eval/report.md` を追加する
  - `tools/schema/gen.mjs`（`--check` 対応。最初は空の contract で動けばよい）
  - `tools/cassette/`（録画再生のヘルパーの雛形。テストつき）
  - `tools/hooks/stop-check.mjs` とそのテスト、`.claude/settings.json`（Stop・PostToolUse）
  - `lefthook.yml`、`.github/workflows/ci.yml`
  - `AGENTS.md`（ルートと4つの層）、`CLAUDE.md`、`README.md`、`.env.example`
  - 層のフォルダ（`src/domain` などに、`index.ts` を1つずつ置く）と、層ごとに1件の自明なテスト
  - GitHub の**公開**リポジトリ（**作る前に本人に確認する**。外部に公開される操作のため）
    - 作る前に、コミットのメールアドレスを GitHub の noreply アドレスに設定する（`git config user.email`）
    - 作った後に、secret scanning と push protection を有効にする
    - Actions の設定で、ワークフローの既定の権限を読み取りのみにし、forkからのPRの実行には承認を必須にする
- **完了条件**:
  1. `pnpm install` と `pnpm check` が、いずれも終了コード0で終わる
  2. `pnpm test tools` が通り、そこに次のテストが含まれている
     - 違反fixtureに対して、R1〜R7 がそれぞれ違反を検出する（ルールごとに1件以上）
     - `file-length.mjs` が301行のfixtureを検出し、300行のfixtureは通す
     - `docs.mjs` が、壊れた相対リンク、一覧にないADR、番号の飛びを検出する
     - `cassette-secrets.mjs` が、`x-api-key` を含むfixtureを検出する
     - `stop-check.mjs` が、check の失敗時に終了コード2を、成功時に0を返す。同じ失敗の3回目では0を返し、incident を書くよう指示を出す
     - `gen.mjs --check` が、生成物を書き換えたfixtureでずれを検出する
     - `fixture-provenance.mjs` が次の3つを検出する: 未登録のfixture、許可リストにないホストの cassette、登録されていない本文を入力にした Anthropic の cassette
     - 実行時に生成した偽のAPIキーを含むファイルを、gitleaks（`pnpm secrets` と同じ設定）が検出する
  3. `src/domain/index.ts` に `import "../adapters"` を一時的に足すと、`pnpm lint:arch` が終了コード1になる（確認したら元に戻す。PRには確認の出力を貼る）
  4. `git log --oneline` にコミットがあり、`git status --porcelain` が空
  5. `pnpm secrets` が終了コード0（履歴全体に秘密情報がない）
  6. `git log --format=%ae | sort -u` の出力が、GitHub の noreply アドレスだけ
  7. `git check-ignore test/fixtures/local/x eval/review/x eval/report.md` が、3つのパスすべてを出力する
  8. GitHub に push したあと、`gh run list --limit 1 --json conclusion -q ".[0].conclusion"` が `success` を返す
  9. `gh api repos/{owner}/{repo} -q ".security_and_analysis.secret_scanning_push_protection.status"` が `enabled` を返す

### 試作品までの道のり

[ADR 0025](../decisions/0025-prototype-first-then-auto-investigation.md) のとおり、ステップ2〜7で試作品を縦に一本通す。試作品の受け入れテストは次のとおり。

> 2人分の根拠（記事のURLと、動画の文字起こし）を入れると、2人が共通して好きな作家が重なりとして出て、タイムスタンプつきの根拠から元の場面に飛べる。

ステップ8で自動調査を足し、ステップ9以降で評価と拡張を行う。

### ステップ2: 外部アダプタと録画再生（`step/02-adapters`）

- **作るもの**:
  - Wikidata（`wbsearchentities`、エンティティの取得、作品の作り手（P50・P676・P86・P175）と代表作（P800）の取得）
  - URLの取得（robots.txt の確認、Readability による本文とタイトルの抽出）
  - Anthropic（構造化出力で抽出を呼ぶ薄いラッパーと、トークン数・費用の算出）
  - `clock`
- **完了条件**:
  1. `pnpm test src/adapters` が、オフラインで通る（ネットワークを遮断しても通る。テストの中で `fetch` が呼ばれたら失敗させる）
  2. cassette がない場合、テストが「cassetteがありません」と明示して失敗することを確かめるテストがある
  3. `pnpm lint` の中で `cassette-secrets.mjs` が通る
  4. URL取得アダプタのテストが、synthetic の HTML だけを使っている（`pnpm lint` の中で `fixture-provenance.mjs` が通る）
  5. `pnpm cassette:record` に許可リスト外のホストを指定すると拒否されること、`--local` を付けると `test/fixtures/local/` に保存されることを確かめるテストがある
  6. `pnpm test:live` が、手元で Wikidata の検索と、URL取得アダプタでの Wikipedia のページの取得に成功する（Anthropic の呼び出しはステップ3で確認する）

### ステップ3: 抽出器（`step/03-extractor`）

- **作るもの**: `domain` に、事前フィルタ、正規化（正規化前後の位置の対応表を含む）、位置を探す引用照合、文字起こしの解析、極性の表示ルールを置く。`shared/contract` に構造化出力のスキーマを置く。`app` に抽出のユースケース（ポート経由）を置く。プロンプトは定義ファイル1つにまとめ、`prompt_version` を計算する。
- **完了条件**:
  1. `pnpm test src/domain` が通り、照合器の表形式のテストに次のケースがある
     - 全角半角の揺れ、空白・改行の揺れ、引用符の揺れ、ダッシュの揺れ、長音記号
     - 捏造した引用の破棄、200字を超える範囲
     - あいまい一致: 1〜2字の誤字がある引用が通る。類似度が閾値未満なら破棄する。相手の名前も別名も含まない範囲は破棄する。カタカナとひらがなの揺れ
     - 保存される文字列が、LLMの `quote` ではなく本文側の文字列で、その位置が正規化前の本文と一致する
  2. 文字起こしの解析のテストに、`0:00`・`12:34`・`1:02:03` の形、タイムスタンプのない行の連結、タイムスタンプが1つもない場合（`paste` として扱う）、本文中の位置から秒への変換、動画のURLからの `video_id` の取り出しがある
  3. 事前フィルタのテストで、該当する段落がない場合に、LLMのポートが呼ばれないことを確かめている
  4. プロンプトの全文のスナップショットテストがある
  5. `pnpm gen:schema` が、抽出スキーマの JSON Schema を `schema/` に出力し、`pnpm check` のずれ検知が通る
  6. `pnpm cli extract --source transcript <synthetic の文字起こし> --dry-run` が、LLMを呼ばずに、フィルタ前後のトークン数と見積もり額（円）を表示する（出力はスナップショットで固定する）
  7. `pnpm test:live` に Haiku で1回抽出するケースが加わり、手元で成功する（費用は1円未満の見込み）

### ステップ4: DBと名寄せ（`step/04-db-resolution`）

- **作るもの**: Drizzle のスキーマとマイグレーション、repo のアダプタ、主体と作品の名寄せのユースケース、重なりと棚のクエリ
- **完了条件**:
  1. 空のDBに対して `pnpm db:migrate` を2回実行しても、どちらも成功する
  2. 同名候補のテストで、候補が複数ある線が `pending_resolution` になり、重なりと棚のクエリに含まれないことを確かめている
  3. 作品の名寄せのテストで、題名が同じでも作り手が違う候補は選ばれないこと、決まらない場合は `work_title_raw` だけが残り、線は作られることを確かめている
  4. 却下の維持のテストで、同じ引用では `rejected` のまま、新しい引用では `unverified` に戻ることを確かめている
  5. 重なりのクエリのテスト（実際のSQLite）で、2人の起点から線がある作り手だけが出ること、`rejected`・`dislikes`・`denies_influence` の線が数えられないこと、起点同士の線も数えること、確認の数を確かめている。並び順は `src/domain` の表形式のテストで確かめている

### ステップ5: 調査パイプラインと予算（`step/05-investigation`）

- **作るもの**: ジョブ（SQLiteを使ったプロセス内のキュー。1つずつ順に実行する）、キャッシュ、予算の確認（[data: 試作品での扱い](data.md#試作品での扱いステップ5)）、極性のフィルタ、`pnpm cli seed`・`investigate`・`overlaps`・`budget`
- **完了条件**:
  1. `pnpm test src/app` に次のテストが含まれ、すべて通る
     - 同じ本文を2回調査しても、LLMのポートの呼び出しは1回
     - 予算の残りが見積もりより少なければ、ジョブは `budget_exceeded` になり、LLMは呼ばれない
     - `dislikes`／`denies_influence` の線が、重なりと棚に出ない
     - 失敗したジョブでも、それまでの実費が記録される
     - **受け入れテスト（架空のデータ）**: 架空の起点2人に、架空の記事と架空の文字起こしを1つずつ入れる（LLMのポートは決まった値を返すフェイク）。重なりのクエリが架空の作家を2人として返し、文字起こし側の根拠に `start_sec` が入っている
  2. `pnpm cli investigate "<人物名>" --source url <URL> --dry-run` が、候補の選択と見積もりまで動く（スナップショット）
  3. `pnpm cli budget` が、当月の使用額と残額を円で表示する（スナップショット）

### ステップ6: API層（`step/06-api`）

- **作るもの**: [api](api.md) のエンドポイント（統合を除く）、エラーの形式、契約テスト
- **完了条件**:
  1. `pnpm test src/server` で、全エンドポイントの正常系と、エラーコードごとに1件以上のエラー系が、contract のスキーマで検証されている
  2. `pnpm gen:schema` のあと、`pnpm check` のずれ検知が通る
  3. `pnpm dev` の起動中に `curl -s http://127.0.0.1:8787/api/health` が `{"ok":true}` を返す
  4. サーバーが `0.0.0.0` ではなく `127.0.0.1` にbindしていることを、テストで確かめている

### ステップ7: 画面（`step/07-screens`）

- **作るもの**: [screens](screens.md) の S1〜S9（グループを除く）、外部リンクのURL生成
- **完了条件**:
  1. `pnpm e2e` で、fixture DB（架空のデータ）を使った次のシナリオがすべて通る
     1. 起点が2人の fixture で、重なりのカードに架空の作家が「2人」と出る
     2. カードの動画の行のリンクが、`t=<秒>s` つきの動画のURLを指している
     3. 根拠パネルで確認すると「確認 1/2」になり、リロード後もそのまま
     4. 線を却下すると重なりから消え、リロード後も出ない
     5. 作品に「気になる」を付けると S9 に出て、リロード後も残る
     6. 1人しか挙げていない「好き」が、その起点の棚に出る
     7. 予算の残りが0円の fixture では、調査ボタンが無効になり、理由が表示される
     8. 名寄せ待ちが1件ある fixture では、ヘッダーに件数バッジが出て、S7で確定すると消える
  2. 外部リンクのURL生成の単体テスト（`src/domain`）で、日本語の題名のエンコードと、設定した店・配信サービスごとのURLを確かめている
  3. **本人による受け入れ（手元）**: 実際の2人分の根拠（記事か動画。少なくとも1つは動画の文字起こし）を入れ、2人が共通して好きな作家が重なりとして出て、動画の根拠から該当の場面に飛べることを、本人が確かめる。PRには結果だけを書く（本文や引用は貼らない。[ADR 0019](../decisions/0019-public-repository-safeguards.md)）

ここまでで試作品が完成する。

### ステップ8: 自動調査（`step/08-auto-investigation`）

- **作るもの**: 検索アダプタ（Claude の Web 検索ツールで、記事のURLと題名だけを取り出す）、検索語の組み立て（`src/domain`。「作品名 インタビュー」「人名 好きな本」「人名 好きな曲」などの型を、起点の作品一覧から組み立てる）、検索の対象から外すサイトの一覧（歌詞、リリース情報）、調査1回あたりの検索回数の上限。見つかったURLは、ステップ5の経路でそのまま調べる（`found_by = search`）
- **完了条件**:
  1. 検索語の組み立ての単体テストで、型ごとの語、上限での打ち切り、同じ入力に同じ順の語を返すことを確かめている
  2. 検索アダプタのテストが、synthetic のレスポンスだけを使い、外すサイトの結果が除かれることを確かめている
  3. `pnpm test src/app` で、同じURLを30日以内に再取得しないこと、検索の費用が `cost_ledger` に `kind = search` で記録されること、見積もりに検索回数が入ることを確かめている
  4. `pnpm cli investigate "<人物名>" --source search --dry-run` が、検索する語の一覧と見積もり額を表示する（スナップショット）
  5. 本人が手元で3人以上を自動調査し、1人あたりの実費（円）を PR に書く。その値をもとに検索回数の上限を決め、[ADR 0025](../decisions/0025-prototype-first-then-auto-investigation.md) に追記する

### ステップ9: 評価と比較（`step/09-eval`）

- **事前に必要なもの**: `eval/gold/` に10人分の正解リスト（**本人が作る**。ステップ8の完了後に依頼する）
- **作るもの**: Wikipedia（ja/en、本文と revision id）のアダプタ、`pnpm eval`（ソース別・モデル別の実行、レポート、目視判定のCSV、`--score`）、`pnpm metrics` の品質の部分
- **完了条件**:
  1. `pnpm eval --sources wikidata,wikipedia,url,transcript,search --model claude-haiku-5-5 --yes` が、`eval/report.md` と `eval/review/<run>.csv` を生成する（どちらも gitignore 済みで、`git status --porcelain` に出ない）。レポートには、ソース別の適合率、再現率、破棄率、あいまい一致の割合、`self` と `third_party` の比率、費用（円）が載っている
  2. 本人が目視判定を記入したあと、`pnpm eval --score <run>` が数値を更新し、`metrics/baseline.json` を書く
  3. レポートに記載された評価の実費の合計が、500円以内
  4. [ADR 0006](../decisions/0006-source-and-model-selection-by-evaluation.md) が「採用」に更新され、SPEC.md の未決事項から該当する項目が消えている
  5. レポートの形式のスナップショットテストが通る

### ステップ10: 統合とグループ（`step/10-merge-groups`）

- **作るもの**: 統合のユースケースとAPI、MusicBrainz のアダプタ（アーティストとメンバー関係。1リクエスト/秒を守る）、グループの重なりの数え方と表示（[screens: グループ](screens.md#グループ)）、Wikidata P737 の一括取り込み
- **完了条件**:
  1. 統合のテストで、線・別名・所属・作品の作り手・却下キーの付け替え、`seed_at` の引き継ぎ、重複した線の結合、`rejected` の優先、`redirect_to` を確かめている
  2. MusicBrainz アダプタのテストで、2回連続の呼び出しの間隔が1秒以上空くことを、フェイクの時計で確かめている
  3. 起点がグループの場合に、メンバーの線をそのグループの線として数えることを、重なりのクエリのテストで確かめている
  4. `pnpm seed:wikidata --domain writers,musicians` が取り込み件数を表示する。cassette を使ったテストで、2回実行しても線が重複しないことを確かめている
  5. `pnpm e2e` で、グループの起点の棚に、メンバーの線が発言者の名前つきで表示される

### ステップ11（任意）: 事前の一括抽出（`step/11-batch`）

- **作るもの**: 人物リストを Batch API で一括抽出し、結果を取り込む処理
- **完了条件**:
  1. `pnpm batch:precompute --list eval/seeds.txt --dry-run` が、件数と見積もり額（Batchの半額を反映したもの）を表示する
  2. 実行時に予算を予約してから投入することを、テストで確かめている
  3. 取り込みのテスト（cassette）で、結果が順不同でも `custom_id` で対応づけられること、一部の失敗が他の結果に影響しないことを確かめている
