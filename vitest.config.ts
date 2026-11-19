import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "services/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    exclude: ["**/*.db.test.ts", "**/*.remote.test.ts", "**/*.live.test.ts", "**/node_modules/**"],
  },
});
