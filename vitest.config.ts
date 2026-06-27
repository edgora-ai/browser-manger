import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fast suite: unit + smoke + the core e2e journey. Deep journeys (j1-j4) run
    // under vitest.config.e2e.ts via `npm run test:e2e`.
    include: [
      "tests/unit/**/*.test.ts",
      "tests/smoke/**/*.test.ts",
      "tests/e2e/journey.test.ts",
    ],
    exclude: ["node_modules", "dist", "tests/e2e/j[1-4]-*.test.ts"],
    globals: true,
    environment: "node",
  },
});
