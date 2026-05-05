import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.real-llm.test.ts"],
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});
