// まだ中身がないコマンドのスタブ。「未実装」と表示して終了コード0で終わる（docs/spec/process.md ステップ1）
// 使い方: node tools/scripts/stub.mjs <コマンド名> <実装するステップ>
const [name = "?", step = "?"] = process.argv.slice(2);
console.log(`未実装: pnpm ${name} はステップ${step}で実装します。`);
