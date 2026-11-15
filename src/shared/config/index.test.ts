import { describe, expect, it } from "vitest";
import { LAYER } from "./index.ts";

describe("shared/config", () => {
  it("層の名前を export する", () => {
    expect(LAYER).toBe("shared/config");
  });
});
