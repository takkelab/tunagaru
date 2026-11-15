import { describe, expect, it } from "vitest";
import { LAYER, schemas } from "./index.ts";

describe("shared/contract", () => {
  it("層の名前を export する", () => {
    expect(LAYER).toBe("shared/contract");
  });

  it("最初はスキーマが空", () => {
    expect(Object.keys(schemas)).toEqual([]);
  });
});
