import { describe, expect, it } from "vitest";
import { LAYER } from "./index.ts";

describe("adapters", () => {
  it("層の名前を export する", () => {
    expect(LAYER).toBe("adapters");
  });
});
