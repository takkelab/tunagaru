// R11: src/shared/contract/ の Zod スキーマから schema/*.json（JSON Schema）を生成する
// 使い方: node tools/schema/gen.mjs [--check] [--contract <index.ts>] [--out <dir>]
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { REPO_ROOT } from "../lib/repo.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : fallback;
};
const check = argv.includes("--check");
const contractPath = opt("--contract", join(REPO_ROOT, "src", "shared", "contract", "index.ts"));
const outDir = opt("--out", join(REPO_ROOT, "schema"));

const { schemas } = await import(pathToFileURL(contractPath).href);
if (!schemas || typeof schemas !== "object") {
  console.error(`${contractPath} が schemas（名前 → Zodスキーマ）を export していません。`);
  process.exit(1);
}

/** @type {Map<string, string>} ファイル名 → 内容 */
const generated = new Map();
for (const [name, schema] of Object.entries(schemas)) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error(`スキーマ名 "${name}" は kebab-case にしてください（ファイル名になります）。`);
    process.exit(1);
  }
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  generated.set(`${name}.json`, `${JSON.stringify(json, null, 2)}\n`);
}

const existing = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith(".json")) : [];

if (check) {
  const problems = [];
  for (const [file, content] of generated) {
    const path = join(outDir, file);
    if (!existsSync(path)) problems.push(`schema/${file} がありません`);
    else if (readFileSync(path, "utf8").replace(/\r\n/g, "\n") !== content)
      problems.push(`schema/${file} が contract とずれています`);
  }
  for (const file of existing) {
    if (!generated.has(file))
      problems.push(`schema/${file} に対応するスキーマが contract にありません`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`R11: ${p}`);
    console.error(
      "\npnpm gen:schema を実行し、生成物をコミットしてください（docs/spec/api.md#契約とスキーマのずれ検知）。",
    );
    process.exit(1);
  }
  console.log(`schema: ずれなし（${generated.size} 件）`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const file of existing) if (!generated.has(file)) rmSync(join(outDir, file));
  for (const [file, content] of generated) writeFileSync(join(outDir, file), content);
  console.log(`schema: ${generated.size} 件を生成しました`);
}
