// R15: gitleaks を実行する。バイナリはバージョンとSHA-256を固定してダウンロードする（ADR 0020）
// 使い方: node tools/secrets/gitleaks.mjs --install | node tools/secrets/gitleaks.mjs <gitleaks の引数…>
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../lib/repo.mjs";

const VERSION = "8.30.1";
/** https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt */
const SHA256 = {
  "darwin-arm64": [
    "darwin_arm64.tar.gz",
    "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  ],
  "darwin-x64": [
    "darwin_x64.tar.gz",
    "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  ],
  "linux-arm64": [
    "linux_arm64.tar.gz",
    "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  ],
  "linux-x64": [
    "linux_x64.tar.gz",
    "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  ],
  "win32-arm64": [
    "windows_arm64.zip",
    "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f",
  ],
  "win32-x64": [
    "windows_x64.zip",
    "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  ],
};

const dir = join(REPO_ROOT, "node_modules", ".cache", "gitleaks", VERSION);
const bin = join(dir, process.platform === "win32" ? "gitleaks.exe" : "gitleaks");

async function install() {
  if (existsSync(bin)) return;
  const target = SHA256[`${process.platform}-${process.arch}`];
  if (!target)
    throw new Error(
      `gitleaks: ${process.platform}-${process.arch} 用のバイナリが登録されていません。`,
    );
  const [suffix, expected] = target;
  const asset = `gitleaks_${VERSION}_${suffix}`;
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${asset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gitleaks: ダウンロードに失敗しました（${res.status} ${url}）`);
  const data = Buffer.from(await res.arrayBuffer());
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expected)
    throw new Error(`gitleaks: SHA-256 が一致しません（${actual}）。中断します。`);
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, asset);
  writeFileSync(archive, data);
  // Windows は bsdtar（System32）が zip を展開できる
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  const result = spawnSync(tar, ["-xf", archive, "-C", dir], { stdio: "inherit" });
  rmSync(archive);
  if (result.status !== 0 || !existsSync(bin)) throw new Error("gitleaks: 展開に失敗しました。");
}

const args = process.argv.slice(2);
try {
  await install();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
if (args[0] === "--install") {
  console.log(`gitleaks ${VERSION}: ${bin}`);
  process.exit(0);
}
const result = spawnSync(bin, args, { stdio: "inherit", cwd: process.cwd() });
process.exit(result.status ?? 1);
