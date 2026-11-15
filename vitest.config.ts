import { defineConfig } from "vitest/config";

// カバレッジの閾値は docs/spec/metrics.md#コードの健全性
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
    exclude: ["**/node_modules/**", "test/e2e/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/web/**", "src/**/*.test.ts"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        lines: 70,
        "src/domain/**": { lines: 90 },
      },
    },
  },
});
