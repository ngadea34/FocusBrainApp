import type pg from "pg";
import type { StepQueue } from "./queue.js";
import { runOnce, type Handlers, type RunResult } from "./runner.js";

export interface LoopOptions {
  workerId: string;
  pollMs: number;
  maintenanceEveryMs: number;
  /** Tâches périodiques : récupérer les étapes abandonnées, vider la file de suppression… */
  maintenance: () => Promise<void>;
  log: (event: string, data: Record<string, unknown>) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Boucle du worker : enchaîne les étapes tant qu'il y en a, attend sinon.
 * L'arrêt (signal) laisse finir l'étape en cours : elle n'est jamais coupée en deux.
 * Une erreur inattendue (base injoignable…) est journalisée puis réessayée après une pause.
 */
export async function runLoop(queue: StepQueue, handlers: Handlers, stop: AbortSignal, o: LoopOptions): Promise<{ processed: number }> {
  const sleep = o.sleep ?? defaultSleep;
  const now = o.now ?? Date.now;
  let processed = 0;
  let lastMaintenance = -Infinity;
  let failures = 0;
  while (!stop.aborted) {
    try {
      if (now() - lastMaintenance >= o.maintenanceEveryMs) {
        lastMaintenance = now();
        await o.maintenance();
      }
      const r: RunResult = await runOnce(queue, handlers, { workerId: o.workerId, log: o.log });
      failures = 0;
      if (r === "idle") await sleep(o.pollMs, stop);
      else processed++;
    } catch (e) {
      failures++;
      o.log("loop_error", { error: e instanceof Error ? e.message : String(e), failures });
      await sleep(Math.min(60_000, o.pollMs * 2 ** Math.min(failures, 4)), stop);
    }
  }
  o.log("stopped", { processed });
  return { processed };
}

/** Maintenance standard : étapes dont le bail a expiré (worker planté) remises en file. */
export async function reapExpiredSteps(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ n: number | null }>("select public.reap_expired_steps() as n");
  return Number(rows[0]?.n ?? 0);
}
