import { defineConfig } from "vitest/config";

// Essais en direct contre les API documentaires publiques (réseau requis, hors CI).
export default defineConfig({
  test: { include: ["packages/*/test/**/*.live.test.ts", "tools/**/*.live.test.ts"], fileParallelism: false, testTimeout: 180_000 },
});
