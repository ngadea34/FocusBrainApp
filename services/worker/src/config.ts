/**
 * Configuration du worker, lue dans les variables d'environnement (fichier .env
 * sur le PC de Nico, jamais commité). Les secrets restent sur la machine du worker.
 */
export interface WorkerConfig {
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  googleTtsApiKey: string | undefined;
  ollamaUrl: string;
  ollamaModel: string;
  openAlexApiKey: string | undefined;
  researchContact: string | undefined;
  workerId: string;
  pollMs: number;
  maintenanceEveryMs: number;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>, hostname = "worker"): WorkerConfig {
  const missing = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter((k) => !env[k]?.trim());
  if (missing.length) throw new ConfigError(`Variables manquantes : ${missing.join(", ")} (voir services/worker/README.md)`);
  const int = (k: string, d: number) => {
    const v = env[k]?.trim();
    if (!v) return d;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ConfigError(`${k} doit être un entier positif`);
    return n;
  };
  const opt = (k: string) => env[k]?.trim() || undefined;
  return {
    databaseUrl: env["DATABASE_URL"]!.trim(),
    supabaseUrl: env["SUPABASE_URL"]!.trim().replace(/\/$/, ""),
    supabaseServiceKey: env["SUPABASE_SERVICE_KEY"]!.trim(),
    googleTtsApiKey: opt("GOOGLE_TTS_API_KEY"),
    ollamaUrl: opt("OLLAMA_URL") ?? "http://127.0.0.1:11434",
    ollamaModel: opt("OLLAMA_MODEL") ?? "qwen3:8b",
    openAlexApiKey: opt("OPENALEX_API_KEY"),
    researchContact: opt("RESEARCH_CONTACT"),
    workerId: opt("WORKER_ID") ?? `${hostname}-${process.pid}`,
    pollMs: int("WORKER_POLL_MS", 5000),
    maintenanceEveryMs: int("WORKER_MAINTENANCE_MS", 60_000),
  };
}

/** Pour les journaux : jamais de secret, seulement ce qui aide à diagnostiquer. */
export function describeConfig(c: WorkerConfig): Record<string, unknown> {
  const host = (() => { try { return new URL(c.databaseUrl).host; } catch { return "?"; } })();
  return {
    database: host, supabase: c.supabaseUrl, ollama: c.ollamaUrl, model: c.ollamaModel,
    tts: c.googleTtsApiKey ? "google-chirp (clé fournie)" : "google-chirp SANS clé (ne marche que si le réseau l'injecte)",
    openalex: c.openAlexApiKey ? "activé" : "désactivé", workerId: c.workerId,
  };
}
