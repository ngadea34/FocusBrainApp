/**
 * Point d'entrée du worker : `pnpm worker` (lit services/worker/.env).
 * Tourne sur la machine qui héberge le modèle local (Ollama, Qwen3 8B) et
 * fabrique les épisodes demandés depuis l'application, étape par étape.
 */
import {
  CrossrefConnector, EuropePmcConnector, HalConnector, Http, MemoryCache, OpenAlexConnector, PubMedConnector,
  ResearchService, WikidataConnector, WikipediaConnector, researchUserAgent,
} from "@app/research";
import { hostname } from "node:os";
import pg from "pg";
import { assembleHandler } from "./assemble.js";
import { ConfigError, describeConfig, loadConfig, type WorkerConfig } from "./config.js";
import { generationHandlers } from "./engines.js";
import { reapExpiredSteps, runLoop } from "./loop.js";
import { OllamaLlm } from "./providers/ollama.js";
import { GoogleChirpTts } from "./providers/google-tts.js";
import { PgQueue } from "./queue.js";
import type { Handlers } from "./runner.js";
import { processStorageDeletions } from "./storage-cleanup.js";
import { SupabaseStore } from "./supabase-store.js";
import { synthesizeSegmentHandler } from "./synthesis.js";

const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }));

export function buildResearch(c: WorkerConfig): ResearchService {
  const http = new Http({
    cache: new MemoryCache(),
    timeoutMs: 45_000,
    userAgent: researchUserAgent(c.researchContact),
    minIntervalMs: { "api.crossref.org": 1100, "eutils.ncbi.nlm.nih.gov": 400, "www.wikidata.org": 1000 },
  });
  return new ResearchService([
    new EuropePmcConnector(http), new PubMedConnector(http), new CrossrefConnector(http), new HalConnector(http),
    new OpenAlexConnector(http, undefined, c.openAlexApiKey), new WikipediaConnector(http), new WikidataConnector(http),
  ], {
    perConnectorLimit: 4,
    // Sans clé, OpenAlex répond 429 (budget anonyme épuisé) : inutile de l'appeler.
    disabled: c.openAlexApiKey ? [] : ["openalex"],
    log,
  });
}

/** Postgres de Supabase : chiffré ; vérification du certificat si DATABASE_CA_FILE est fourni. */
export function poolConfig(databaseUrl: string, ca?: string): pg.PoolConfig {
  let host = "";
  try { host = new URL(databaseUrl).hostname; } catch { /* hôte vide (socket Unix) : URL non analysable */ }
  const local = !host || host === "localhost" || host === "127.0.0.1"; // hôte vide : socket Unix (?host=/chemin)
  return {
    connectionString: databaseUrl.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""),
    max: 4,
    ...(local ? {} : { ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } }),
  };
}

async function main(): Promise<void> {
  let config: WorkerConfig;
  try { config = loadConfig(process.env, hostname()); } catch (e) {
    if (e instanceof ConfigError) { console.error(e.message); process.exit(2); }
    throw e;
  }
  const ca = process.env["DATABASE_CA_FILE"] ? (await import("node:fs")).readFileSync(process.env["DATABASE_CA_FILE"], "utf8") : undefined;
  const pool = new pg.Pool(poolConfig(config.databaseUrl, ca));
  pool.on("error", (e) => log("pool_error", { error: e.message }));
  const store = new SupabaseStore({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
  const llm = new OllamaLlm({ baseUrl: config.ollamaUrl, model: config.ollamaModel });
  const tts = new GoogleChirpTts(config.googleTtsApiKey ? { apiKey: config.googleTtsApiKey } : {});

  await pool.query("select 1");
  log("started", describeConfig(config));

  const handlers: Handlers = {
    ...generationHandlers({ pool, llm, research: buildResearch(config) }),
    synthesize_segment: synthesizeSegmentHandler({ pool, tts, store }),
    assemble: assembleHandler({ pool, store }),
  };

  const stop = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      if (stop.signal.aborted) process.exit(1); // second Ctrl+C : arrêt immédiat
      log("stopping", { signal: sig, hint: "fin de l'étape en cours ; Ctrl+C à nouveau pour forcer" });
      stop.abort();
    });
  }

  await runLoop(new PgQueue(pool), handlers, stop.signal, {
    workerId: config.workerId,
    pollMs: config.pollMs,
    maintenanceEveryMs: config.maintenanceEveryMs,
    log,
    maintenance: async () => {
      const reaped = await reapExpiredSteps(pool);
      const deleted = await processStorageDeletions(pool, { [store.bucket]: store });
      if (reaped || deleted) log("maintenance", { reaped, deleted });
    },
  });
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("main.ts")) {
  main().catch((e) => { log("fatal", { error: e instanceof Error ? e.message : String(e) }); process.exit(1); });
}
