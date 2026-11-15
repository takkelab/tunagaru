import { describe, expect, it } from "vitest";
import { LAYER } from "./index.ts";

describe("web", () => {
  it("層の名前を export する", () => {
    expect(LAYER).toBe("web");
  });
});
