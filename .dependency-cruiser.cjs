// 層の境界のルール（R1〜R7）。docs/spec/architecture.md#lintで強制する設計ルール
const DOC = "docs/spec/architecture.md#lintで強制する設計ルール";
const sdk = (pkg) => `(^|node_modules/)${pkg}(/|$)`;
// テストファイルからの vitest だけは許す（R1・R2 の対象はテスト以外の依存）
const TEST_RUNNER = "(^|node_modules/)vitest(/|$)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment: `R1: domain は他の層も外部パッケージも Node の組み込みモジュールも import できません。必要な値は引数で受け取り、入出力は app のポートに移してください。${DOC}`,
      severity: "error",
      from: { path: "^src/domain/" },
      to: { pathNot: `^src/domain/|${TEST_RUNNER}` },
    },
    {
      name: "app-depends-on-domain-only",
      comment: `R2: app が依存してよいのは domain だけです。外部の処理は app/ports にインターフェースを置き、adapters で実装してください。${DOC}`,
      severity: "error",
      from: { path: "^src/app/" },
      to: { pathNot: `^src/(app|domain)/|${TEST_RUNNER}` },
    },
    {
      name: "adapters-boundary",
      comment: `R3: adapters が依存してよいのは domain と app/ports だけです。ほかの層の機能が必要なら、ポートの定義を見直してください。${DOC}`,
      severity: "error",
      from: { path: "^src/adapters/", pathNot: ".test.ts$" },
      to: { path: "^src/", pathNot: "^src/(domain|app/ports|adapters)/" },
    },
    {
      name: "adapters-boundary",
      comment: `R3: adapters 同士は import できません（例: adapters/db から adapters/wikidata）。組み合わせは composition root（server/main.ts・cli/main.ts）か app のユースケースで行ってください。${DOC}`,
      severity: "error",
      from: { path: "^src/adapters/([^/]+)/" },
      to: { path: "^src/adapters/", pathNot: "^src/adapters/$1/" },
    },
    {
      name: "adapters-boundary",
      comment: `R3: adapters のテストが src の外で使えるのは tools/cassette だけです。${DOC}`,
      severity: "error",
      from: { path: "^src/adapters/.+.test.ts$" },
      to: {
        path: "^(?!src/|node_modules/)",
        pathNot: "^tools/cassette/",
        dependencyTypesNot: ["npm", "npm-dev", "core"],
      },
    },
    {
      name: "web-uses-contract-only",
      comment: `R4: web が依存してよいのは shared/contract と UI の外部パッケージだけです。サーバーの機能は API 経由で使ってください。${DOC}`,
      severity: "error",
      from: { path: "^src/web/" },
      to: { path: "^src/", pathNot: "^src/(web|shared/contract)/" },
    },
    {
      name: "web-uses-contract-only",
      comment: `R4: web では Node の組み込みモジュールを使えません。${DOC}`,
      severity: "error",
      from: { path: "^src/web/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "only-composition-root-wires-adapters",
      comment: `R5: adapters を import してよいのは src/server/main.ts と src/cli/main.ts だけです。ユースケースにはポートの型で受け取らせ、main.ts で組み立てて渡してください。${DOC}`,
      severity: "error",
      from: { pathNot: "^src/(adapters/|server/main.ts$|cli/main.ts$)" },
      to: { path: "^src/adapters/" },
    },
    {
      name: "sdk-confinement",
      comment: `R6: @anthropic-ai/sdk は src/adapters/anthropic/ からだけ import できます。${DOC}`,
      severity: "error",
      from: { pathNot: "^src/adapters/anthropic/" },
      to: { path: sdk("@anthropic-ai/sdk") },
    },
    {
      name: "sdk-confinement",
      comment: `R6: better-sqlite3・drizzle-orm は src/adapters/db/ からだけ import できます。${DOC}`,
      severity: "error",
      from: { pathNot: "^src/adapters/db/" },
      to: { path: `${sdk("better-sqlite3")}|${sdk("drizzle-orm")}` },
    },
    {
      name: "sdk-confinement",
      comment: `R6: @mozilla/readability・linkedom は src/adapters/web/ からだけ import できます。${DOC}`,
      severity: "error",
      from: { pathNot: "^src/adapters/web/" },
      to: { path: `${sdk("@mozilla/readability")}|${sdk("linkedom")}` },
    },
    {
      name: "test-runner-in-tests-only",
      comment: `R1・R2 の補足: vitest を import してよいのはテストファイル（*.test.ts）だけです。${DOC}`,
      severity: "error",
      from: { path: "^src/", pathNot: ".test.tsx?$" },
      to: { path: TEST_RUNNER },
    },
    {
      name: "no-circular",
      comment: `R7: 循環参照は禁止です。共通の部分を下の層（domain など）に切り出してください。${DOC}`,
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".json"],
      conditionNames: ["import", "require", "node", "default", "types"],
      exportsFields: ["exports"],
      mainFields: ["module", "main", "types"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
