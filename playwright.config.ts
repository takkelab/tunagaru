import { defineConfig } from "@playwright/test";

// E2E は fixture DB で server を起動して行う（ステップ8）。今は最小の1件だけ
export default defineConfig({
  testDir: "test/e2e",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8787" },
});
