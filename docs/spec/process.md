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

### ステップ2: 外部アダプタと録画再生（`step/02-adapters`）

- **作るもの**:
  - Wikidata（`wbsearchentities`、エンティティの取得、P737のSPARQL）
  - Wikipedia（ja/en、本文と revision id）
  - MusicBrainz（アーティストとメンバー関係。1リクエスト/秒を守る）
  - URLの取得（robots.txt の確認、Readability による本文抽出）
  - Anthropic（構造化出力で抽出を呼ぶ薄いラッパーと、トークン数・費用の算出）
  - `clock`
  - 検索アダプタは、インターフェースと候補1つ分の実装まで。提供元の確定はステップ4
- **完了条件**:
  1. `pnpm test src/adapters` が、オフラインで通る（ネットワークを遮断しても通る。テストの中で `fetch` が呼ばれたら失敗させる）
  2. cassette がない場合、テストが「cassetteがありません」と明示して失敗することを確かめるテストがある
  3. `pnpm lint` の中で `cassette-secrets.mjs` が通る
  4. MusicBrainz アダプタのテストで、2回連続の呼び出しの間隔が1秒以上空くことを、フェイクの時計で確かめている
  5. URL取得アダプタと検索アダプタのテストが、synthetic の HTML とレスポンスだけを使っている（`pnpm lint` の中で `fixture-provenance.mjs` が通る）
  6. `pnpm cassette:record` に許可リスト外のホストを指定すると拒否されること、`--local` を付けると `test/fixtures/local/` に保存されることを確かめるテストがある
  7. `pnpm test:live` が、手元でWikidata検索と Wikipedia の取得に成功する（Anthropic の呼び出しはステップ3で確認する）

### ステップ3: 抽出器（`step/03-extractor`）

- **作るもの**: `domain` に、事前フィルタ、正規化、引用照合、極性の表示ルールを置く。`shared/contract` に構造化出力のスキーマを置く。`app` に抽出のユースケース（ポート経由）を置く。プロンプトは定義ファイル1つにまとめ、`prompt_version` を計算する。
- **完了条件**:
  1. `pnpm test src/domain` が通り、照合器の表形式のテストに次のケースがある
     - 全角半角の揺れ、空白・改行の揺れ、引用符の揺れ、ダッシュの揺れ、長音記号
     - 捏造した引用の破棄、200字を超える引用
  2. 事前フィルタのテストで、該当する段落がない場合に、LLMのポートが呼ばれないことを確かめている
  3. プロンプトの全文のスナップショットテストがある
  4. `pnpm gen:schema` が、抽出スキーマの JSON Schema を `schema/` に出力し、`pnpm check` のずれ検知が通る
  5. `pnpm cli extract --person <QID> --source wikipedia --dry-run` が、LLMを呼ばずに、フィルタ前後のトークン数と見積もり額（円）を表示する（出力はスナップショットで固定する）
  6. `pnpm test:live` に Haiku で1回抽出するケースが加わり、手元で成功する（費用は1円未満の見込み）

### ステップ4: 評価と比較（`step/04-eval`）

- **事前に必要なもの**: `eval/gold/` に10人分の正解リスト（**本人が作る**。ステップ3の完了後に依頼する）
- **作るもの**: `pnpm eval`（ソース別・モデル別の実行、レポート、目視判定のCSV、`--score`）、`pnpm metrics` の品質の部分
- **完了条件**:
  1. `pnpm eval --sources wikidata,wikipedia,url,search --model claude-haiku-5-5 --yes` が、`eval/report.md` と `eval/review/<run>.csv` を生成する（どちらも gitignore 済みで、`git status --porcelain` に出ない）。レポートには、ソース別の適合率、再現率、破棄率、`self` と `third_party` の比率、費用（円）が載っている
  2. 本人が目視判定を記入したあと、`pnpm eval --score <run>` が数値を更新し、`metrics/baseline.json` を書く
  3. レポートに記載された評価の実費の合計が、500円以内
  4. [ADR 0006](../decisions/0006-source-and-model-selection-by-evaluation.md) が「採用」に更新され、SPEC.md の未決事項から該当する項目が消えている
  5. レポートの形式のスナップショットテストが通る

### ステップ5: DBと名寄せ（`step/05-db-resolution`）

- **作るもの**: Drizzle のスキーマとマイグレーション、repo のアダプタ、名寄せと統合のユースケース、P737の一括取り込み
- **完了条件**:
  1. 空のDBに対して `pnpm db:migrate` を2回実行しても、どちらも成功する
  2. `pnpm seed:wikidata --domain writers,musicians` が取り込み件数を表示する。cassette を使ったテストで、2回実行しても線が重複しないことを確かめている
  3. 統合のテストで、線・別名・所属・マーク・却下キーの付け替え、重複した線の結合、`rejected` の優先、`redirect_to` を確かめている
  4. 同名候補のテストで、候補が複数ある線が `pending_resolution` になり、グラフ用のクエリに含まれないことを確かめている
  5. 却下の維持のテストで、同じ引用では `rejected` のまま、新しい引用では `unverified` に戻ることを確かめている

### ステップ6: 調査パイプラインと予算（`step/06-investigation`）

- **作るもの**: ジョブ（SQLiteを使ったプロセス内のキュー）、キャッシュ、予算の予約と精算、極性のフィルタ、`pnpm cli investigate`、`pnpm cli budget`
- **完了条件**:
  1. `pnpm test src/app` に次のテストが含まれ、すべて通る
     - 同じ本文を2回調査しても、LLMのポートの呼び出しは1回
     - 予算の残りが見積もりより少なければ、ジョブは `budget_exceeded` になり、LLMは呼ばれない
     - 並行する2つのジョブの予約の合計が、上限を超えない（実際のSQLiteを使う統合テスト）
     - `dislikes`／`denies_influence` の線が、グラフ用のクエリに出ない
     - 失敗したジョブでも、それまでの実費が記録される
  2. `pnpm cli investigate "<人物名>" --source wikipedia --dry-run` が、候補の選択と見積もりまで動く（スナップショット）
  3. `pnpm cli budget` が、当月の使用額・予約額・残額を円で表示する（スナップショット）

### ステップ7: API層（`step/07-api`）

- **作るもの**: [api](api.md) の全エンドポイント、エラーの形式、契約テスト
- **完了条件**:
  1. `pnpm test src/server` で、全エンドポイントの正常系と、エラーコードごとに1件以上のエラー系が、contract のスキーマで検証されている
  2. `pnpm gen:schema` のあと、`pnpm check` のずれ検知が通る
  3. `pnpm dev` の起動中に `curl -s http://127.0.0.1:8787/api/health` が `{"ok":true}` を返す
  4. サーバーが `0.0.0.0` ではなく `127.0.0.1` にbindしていることを、テストで確かめている

### ステップ8: グラフUI（`step/08-graph-ui`）

- **作るもの**: [screens](screens.md) の S1〜S8
- **完了条件**: `pnpm e2e` で、fixture DB を使った次のシナリオがすべて通る
  1. 作品名で検索し、役割つきの候補から作者を選ぶと、ノードが表示される
  2. 子ノードが21件以上ある人物を展開すると、20件と「+N」が表示される
  3. 未確認の線が破線で表示される。根拠パネルで承認すると実線になり、リロード後も実線のまま
  4. 線を却下すると消え、リロード後も表示されない
  5. グループを展開すると、メンバーの線が発言者ラベルつきで表示される
  6. 予算の残りが0円の fixture では、調査ボタンが無効になり、理由が表示される
  7. 名寄せ待ちが1件ある fixture では、ヘッダーに件数バッジが出て、S7で確定すると消える

### ステップ9: 好みを広げる機能（`step/09-taste`）

- **作るもの**: マーク、合流スコア、「合わなかった」の減点、外部リンク
- **完了条件**:
  1. 並び順の単体テスト（`src/domain`）で、合流 → 承認 → 出典数 → 名前の順と、「合わなかった」の減点を表形式で確かめている
  2. `pnpm e2e` で、2人に「好き」をつけると、その2人から線が来ている人物が強調される。マークはリロード後も残る
  3. 外部リンクのURL生成の単体テストで、日本語名のエンコードと、職業ごとに表示するリンクの切り替えを確かめている

### ステップ10（任意）: 事前の一括抽出（`step/10-batch`）

- **作るもの**: 人物リストを Batch API で一括抽出し、結果を取り込む処理
- **完了条件**:
  1. `pnpm batch:precompute --list eval/seeds.txt --dry-run` が、件数と見積もり額（Batchの半額を反映したもの）を表示する
  2. 実行時に予算を予約してから投入することを、テストで確かめている
  3. 取り込みのテスト（cassette）で、結果が順不同でも `custom_id` で対応づけられること、一部の失敗が他の結果に影響しないことを確かめている
