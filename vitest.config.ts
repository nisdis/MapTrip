import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts"],
    environment: "node",
    // API tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
