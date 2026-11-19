import { defineConfig } from "vitest/config";

// Tests d'intégration qui exigent la base de test (créée par supabase/tests/run.sh).
export default defineConfig({
  test: { include: ["services/*/test/**/*.db.test.ts"], fileParallelism: false, testTimeout: 30_000 },
});
