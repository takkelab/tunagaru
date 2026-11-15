# tunagaru

好きな人たちが公言した「好き」を集めて横に並べ、気づいていなかった重なりを見つける、個人用のWebアプリです。仕様は [SPEC.md](SPEC.md) にあります。

## 起動

Node.js 22 以上と pnpm が必要です。

```sh
pnpm install          # 依存と gitleaks のバイナリを入れ、git フックを設定する
cp .env.example .env  # ANTHROPIC_API_KEY を書く（.env はコミットしない）
pnpm check            # 一括検証
pnpm dev              # 開発サーバー（ステップ6で実装）
```
