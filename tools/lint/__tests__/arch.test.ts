// R1〜R7（dependency-cruiser）が、違反を仕込んだfixtureで違反を検出することを確かめる
import { describe, expect, it } from "vitest";
import { makeTree, runScript } from "../../lib/test-helpers.ts";

const run = (files: Record<string, string>) =>
  runScript("tools/lint/arch.mjs", ["--root", makeTree(files)]);

const cases: { rule: string; title: string; files: Record<string, string> }[] = [
  {
    rule: "domain-is-pure",
    title: "R1: domain が外部パッケージを import する",
    files: { "src/domain/x.ts": 'import { z } from "zod";\nexport const s = z;\n' },
  },
  {
    rule: "domain-is-pure",
    title: "R1: domain が Node の組み込みモジュールを import する",
    files: {
      "src/domain/x.ts":
        'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n',
    },
  },
  {
    rule: "app-depends-on-domain-only",
    title: "R2: app が shared/config を import する",
    files: {
      "src/shared/config/index.ts": "export const c = 1;\n",
      "src/app/x.ts": 'import { c } from "../shared/config/index.ts";\nexport const y = c;\n',
    },
  },
  {
    rule: "adapters-boundary",
    title: "R3: adapters 同士の import",
    files: {
      "src/adapters/wikidata/index.ts": "export const w = 1;\n",
      "src/adapters/db/x.ts": 'import { w } from "../wikidata/index.ts";\nexport const y = w;\n',
    },
  },
  {
    rule: "adapters-boundary",
    title: "R3: adapters が app/ports 以外の app を import する",
    files: {
      "src/app/usecases/search.ts": "export const s = 1;\n",
      "src/adapters/db/x.ts":
        'import { s } from "../../app/usecases/search.ts";\nexport const y = s;\n',
    },
  },
  {
    rule: "web-uses-contract-only",
    title: "R4: web が app を import する",
    files: {
      "src/app/index.ts": "export const a = 1;\n",
      "src/web/x.ts": 'import { a } from "../app/index.ts";\nexport const y = a;\n',
    },
  },
  {
    rule: "web-uses-contract-only",
    title: "R4: web が Node の組み込みモジュールを import する",
    files: {
      "src/web/x.ts": 'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n',
    },
  },
  {
    rule: "only-composition-root-wires-adapters",
    title: "R5: server/routes が adapters を import する",
    files: {
      "src/adapters/index.ts": "export const a = 1;\n",
      "src/server/routes/x.ts":
        'import { a } from "../../adapters/index.ts";\nexport const y = a;\n',
    },
  },
  {
    rule: "sdk-confinement",
    title: "R6: adapters/db が @anthropic-ai/sdk を import する",
    files: {
      "src/adapters/db/x.ts":
        'import Anthropic from "@anthropic-ai/sdk";\nexport const A = Anthropic;\n',
    },
  },
  {
    rule: "sdk-confinement",
    title: "R6: adapters/anthropic が better-sqlite3 を import する",
    files: {
      "src/adapters/anthropic/x.ts": 'import Db from "better-sqlite3";\nexport const D = Db;\n',
    },
  },
  {
    rule: "sdk-confinement",
    title: "R6: adapters/db が linkedom を import する",
    files: {
      "src/adapters/db/x.ts":
        'import { parseHTML } from "linkedom";\nexport const p = parseHTML;\n',
    },
  },
  {
    rule: "test-runner-in-tests-only",
    title: "R1: テスト以外のファイルが vitest を import する",
    files: { "src/domain/x.ts": 'import { expect } from "vitest";\nexport const e = expect;\n' },
  },
  {
    rule: "no-circular",
    title: "R7: 循環参照",
    files: {
      "src/domain/a.ts": 'import { b } from "./b.ts";\nexport const a = () => b;\n',
      "src/domain/b.ts": 'import { a } from "./a.ts";\nexport const b = () => a;\n',
    },
  },
];

describe("dependency-cruiser の設計ルール", () => {
  it.each(cases)("$title を検出する", ({ rule, files }) => {
    const r = run(files);
    expect(r.status).toBe(1);
    expect(r.output).toContain(`error ${rule}:`);
    expect(r.output).toContain("docs/spec/architecture.md");
  });

  it("違反がなければ終了コード0", () => {
    const r = run({
      "src/domain/index.ts": "export const d = 1;\n",
      "src/domain/index.test.ts": 'import { it } from "vitest";\nit("x", () => {});\n',
      "src/app/index.test.ts": 'import { it } from "vitest";\nit("x", () => {});\n',
      "src/app/ports/index.ts": 'import { d } from "../../domain/index.ts";\nexport const p = d;\n',
      "src/adapters/db/index.ts":
        'import { p } from "../../app/ports/index.ts";\nexport const q = p;\n',
      "src/server/main.ts": 'import { q } from "../adapters/db/index.ts";\nexport const m = q;\n',
      "src/shared/contract/index.ts":
        'import { d } from "../../domain/index.ts";\nexport const c = d;\n',
      "src/web/x.ts": 'import { c } from "../shared/contract/index.ts";\nexport const w = c;\n',
    });
    expect(r.status).toBe(0);
  });
});
