import { describe, expect, it } from "vitest";
import { chaptersFor, concatBytes, ConfigError, describeConfig, loadConfig, runLoop, stripId3, type StepQueue } from "../src/index.js";
import { poolConfig } from "../src/main.js";

const ENV = { DATABASE_URL: "postgresql://u:secret-pw@aws-0-eu-north-1.pooler.supabase.com:5432/postgres", SUPABASE_URL: "https://x.supabase.co/", SUPABASE_SERVICE_KEY: "sb_secret_abc" };

describe("configuration", () => {
  it("lit les variables, applique les valeurs par défaut", () => {
    const c = loadConfig(ENV, "pc");
    expect(c).toMatchObject({ supabaseUrl: "https://x.supabase.co", ollamaUrl: "http://127.0.0.1:11434", ollamaModel: "qwen3:8b", pollMs: 5000, openAlexApiKey: undefined });
    expect(c.workerId).toMatch(/^pc-\d+$/);
  });

  it("refuse une configuration incomplète ou invalide, en nommant les variables", () => {
    expect(() => loadConfig({ SUPABASE_URL: "x" })).toThrow(/DATABASE_URL, SUPABASE_SERVICE_KEY/);
    expect(() => loadConfig({ ...ENV, WORKER_POLL_MS: "-1" })).toThrow(ConfigError);
  });

  it("le résumé journalisé ne contient aucun secret", () => {
    const text = JSON.stringify(describeConfig(loadConfig({ ...ENV, GOOGLE_TTS_API_KEY: "AIza-secret", OPENALEX_API_KEY: "oa-secret" })));
    for (const s of ["secret-pw", "sb_secret_abc", "AIza-secret", "oa-secret"]) expect(text).not.toContain(s);
    expect(text).toContain("aws-0-eu-north-1.pooler.supabase.com");
  });

  it("chiffre la connexion à Supabase, pas à une base locale", () => {
    expect(poolConfig(`${ENV.DATABASE_URL}?sslmode=require`)).toMatchObject({ connectionString: ENV.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    expect(poolConfig(ENV.DATABASE_URL, "CA")).toMatchObject({ ssl: { ca: "CA", rejectUnauthorized: true } });
    expect(poolConfig("postgresql://postgres@localhost:5432/app")).not.toHaveProperty("ssl");
  });
});

describe("montage", () => {
  it("retire l'étiquette ID3v2 et concatène", () => {
    const tagged = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 9, 9, 0xff, 0xfb, 7]);
    expect([...concatBytes([stripId3(tagged), new Uint8Array([0xff, 0xfb, 8])])]).toEqual([0xff, 0xfb, 7, 0xff, 0xfb, 8]);
    expect([...stripId3(new Uint8Array([0xff, 0xfb]))]).toEqual([0xff, 0xfb]);
  });

  it("un chapitre par section, au début de son premier segment", () => {
    expect(chaptersFor([
      { durationMs: 1000, chapterTitle: "Intro", sectionId: "a" },
      { durationMs: 2000, chapterTitle: "Intro", sectionId: "a" },
      { durationMs: 500, chapterTitle: "Suite", sectionId: "b" },
      { durationMs: 500, chapterTitle: null, sectionId: null },
    ])).toEqual([{ title: "Intro", start_ms: 0 }, { title: "Suite", start_ms: 3000 }]);
  });
});

describe("boucle", () => {
  it("attend quand la base est injoignable, avec une pause croissante, puis s'arrête proprement", async () => {
    const stop = new AbortController();
    const sleeps: number[] = [];
    let claims = 0;
    const queue = { claim: async () => { claims++; throw new Error("ECONNREFUSED"); } } as unknown as StepQueue;
    const logs: string[] = [];
    await runLoop(queue, { intent: async () => ({ output: {}, usage: [] }) }, stop.signal, {
      workerId: "w", pollMs: 100, maintenanceEveryMs: 1e9, maintenance: async () => {}, log: (e) => logs.push(e),
      sleep: async (ms) => { sleeps.push(ms); if (sleeps.length === 5) stop.abort(); },
    });
    expect(claims).toBe(5);
    expect(sleeps).toEqual([200, 400, 800, 1600, 1600]);
    expect(logs.filter((l) => l === "loop_error")).toHaveLength(5);
    expect(logs.at(-1)).toBe("stopped");
  });
});
