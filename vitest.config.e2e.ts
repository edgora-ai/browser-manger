import { defineConfig } from "vitest/config";

// E2E config — drives the real Electron app via Playwright.
// Serial + no parallelism: only one Electron app at a time (CDP port allocator
// and MCP port 26581 would otherwise conflict).
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    globals: true,
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 90_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
