// R8・R13（Biome）が、違反を仕込んだfixtureで違反を検出することを確かめる
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTree, REPO_ROOT } from "../../lib/test-helpers.ts";

/** リポジトリの biome.json をそのまま使い、fixture のディレクトリで biome lint を実行する */
function lint(files: Record<string, string>) {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, "biome.json"), "utf8"));
  delete config.$schema;
  config.vcs.enabled = false;
  const plugin = readFileSync(join(REPO_ROOT, "tools/lint/biome/no-math-random.grit"), "utf8");
  const root = makeTree({
    ...files,
    "biome.json": JSON.stringify(config),
    "tools/lint/biome/no-math-random.grit": plugin,
  });
  const biome = join(REPO_ROOT, "node_modules/@biomejs/biome/bin/biome");
  const r = spawnSync(process.execPath, [biome, "lint", "--max-diagnostics=200", "src"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
}

const cases = [
  {
    title: "R8: app で fetch",
    file: "src/app/x.ts",
    code: "export const f = fetch;\n",
    expected: "noRestrictedGlobals",
  },
  {
    title: "R8: app で process.env",
    file: "src/app/x.ts",
    code: "export const e = process.env.X;\n",
    expected: "noProcessEnv",
  },
  {
    title: "R8: domain で Date",
    file: "src/domain/x.ts",
    code: "export const d = Date.now();\n",
    expected: "noRestrictedGlobals",
  },
  {
    title: "R8: domain で setTimeout",
    file: "src/domain/x.ts",
    code: "setTimeout(() => {}, 1);\n",
    expected: "noRestrictedGlobals",
  },
  {
    title: "R8: domain で Math.random",
    file: "src/domain/x.ts",
    code: "export const r = Math.random();\n",
    expected: "Math.random",
  },
  {
    title: "R13: any",
    file: "src/app/x.ts",
    code: "export const a: any = 1;\n",
    expected: "noExplicitAny",
  },
  {
    title: "R13: 未使用の import",
    file: "src/app/x.ts",
    code: 'import { join } from "node:path";\n',
    expected: "noUnusedImports",
  },
  {
    title: "R13: 未使用の変数",
    file: "src/app/x.ts",
    code: "export function f() {\n  const unused = 1;\n}\n",
    expected: "noUnusedVariables",
  },
  {
    title: "R13: src/cli 以外の console",
    file: "src/server/x.ts",
    code: "console.log(1);\n",
    expected: "noConsole",
  },
];

describe("Biome の設計ルール", () => {
  it.each(cases)("$title を検出する", ({ file, code, expected }) => {
    const r = lint({ [file]: code });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain(expected);
  });

  it("adapters の fetch・process.env と、cli の console は許す", () => {
    const r = lint({
      "src/adapters/web/x.ts": "export const f = fetch;\nexport const e = process.env.X;\n",
      "src/cli/x.ts": "console.log(1);\n",
      "src/domain/x.ts": "export const m = Math.max(1, 2);\n",
    });
    expect(r.output).not.toContain("noRestrictedGlobals");
    expect(r.output).not.toContain("noProcessEnv");
    expect(r.output).not.toContain("noConsole");
    expect(r.output).not.toContain("Math.random");
    expect(r.status).toBe(0);
  });
});
