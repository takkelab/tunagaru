# tunagaru

好きな作家・音楽家が公言した「好き」を辿り、グラフとして見ながら好みを広げる、個人用のWebアプリです。仕様は [SPEC.md](SPEC.md) にあります。

## 起動

Node.js 22 以上と pnpm が必要です。

```sh
pnpm install          # 依存と gitleaks のバイナリを入れ、git フックを設定する
cp .env.example .env  # ANTHROPIC_API_KEY を書く（.env はコミットしない）
pnpm check            # 一括検証
pnpm dev              # 開発サーバー（ステップ7で実装）
```
