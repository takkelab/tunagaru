// stop-check.mjs: check の失敗時に2、成功時に0を返す。同じ失敗の3回目では0を返し、incident を書くよう指示する
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTree, runScript } from "../../lib/test-helpers.ts";

const node = (code: string) => `"${process.execPath}" -e "${code}"`;
const PASS = node("process.exit(0)");
const FAIL = node("console.error('error TS2322: Type mismatch at src/x.ts:10'); process.exit(1)");
const OTHER = node("console.error('R9: src/y.ts が 301 行です'); process.exit(1)");

function hook() {
  const state = join(makeTree({}), "state.json");
  return {
    state,
    run: (cmd: string) =>
      runScript("tools/hooks/stop-check.mjs", [], {
        env: { STOP_CHECK_CMD: cmd, STOP_CHECK_STATE: state },
      }),
  };
}

describe("stop-check", () => {
  it("check が成功したら終了コード0", () => {
    expect(hook().run(PASS).status).toBe(0);
  });

  it("check が失敗したら終了コード2で、エラーの要約を stderr に出す", () => {
    const r = hook().run(FAIL);
    expect(r.status).toBe(2);
    expect(r.output).toContain("pnpm check が失敗しました");
    expect(r.output).toContain("error TS2322");
  });

  it("同じ失敗の3回目では0を返し、incident を書くよう指示する", () => {
    const h = hook();
    expect(h.run(FAIL).status).toBe(2);
    const second = h.run(FAIL);
    expect(second.status).toBe(2);
    expect(second.output).toContain("次も同じなら止めません");
    const third = h.run(FAIL);
    expect(third.status).toBe(0);
    expect(JSON.parse(third.stdout).systemMessage).toContain("docs/process/incidents/");
  });

  it("違う失敗なら数え直す", () => {
    const h = hook();
    h.run(FAIL);
    h.run(FAIL);
    expect(h.run(OTHER).status).toBe(2);
  });

  it("成功したら状態を消す", () => {
    const h = hook();
    h.run(FAIL);
    h.run(FAIL);
    expect(h.run(PASS).status).toBe(0);
    expect(existsSync(h.state)).toBe(false);
    expect(h.run(FAIL).status).toBe(2);
  });
});
