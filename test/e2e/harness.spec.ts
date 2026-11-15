import { expect, test } from "@playwright/test";

// ハーネスの確認用。ブラウザを使わないので、playwright install なしで動く
test("Playwright が動く", () => {
  expect(1 + 1).toBe(2);
});
