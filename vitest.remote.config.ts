import { defineConfig } from "vitest/config";

// Tests sur un vrai projet Supabase (créent puis suppriment des données jetables).
export default defineConfig({
  test: { include: ["supabase/tests/remote/**/*.remote.test.ts", "apps/*/test/**/*.remote.test.ts"], fileParallelism: false, testTimeout: 30_000 },
});
