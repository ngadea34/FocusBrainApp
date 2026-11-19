import type { StepType } from "@app/contracts";
import { isRetryable, nextAfter, type StepOutcome, type UsageRecord } from "@app/pipeline";
import type { ClaimedStep, JobContext, StepQueue } from "./queue.js";

/** Résultat d'un moteur pour une étape. */
export interface HandlerResult {
  output: unknown;
  usage: UsageRecord[];
  /** Informations utiles au graphe (réécriture, segments…). */
  outcome?: Omit<StepOutcome, "completed" | "completedKey" | "requireOutlineApproval">;
  /** Entrées des étapes à planifier, par clé (ex. texte de chaque segment vocal). */
  nextInputs?: Readonly<Record<string, unknown>>;
}

export type StepHandler = (step: ClaimedStep, job: JobContext, signal: AbortSignal) => Promise<HandlerResult>;
export type Handlers = Partial<Record<StepType, StepHandler>>;

/** Erreur explicitement définitive (entrée invalide, refus du modèle…). */
export class PermanentError extends Error {
  override readonly name = "PermanentError";
}

export interface RunnerOptions {
  workerId: string;
  leaseSeconds?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export type RunResult = "idle" | "succeeded" | "retry_scheduled" | "dead" | "cost_cap_exceeded" | "cancelled" | "lease_lost";

/**
 * Traite au plus une étape. Logs minimisés : identifiants techniques seulement,
 * jamais le sujet, le texte ou les sources de l'utilisateur.
 */
export async function runOnce(queue: StepQueue, handlers: Handlers, opts: RunnerOptions): Promise<RunResult> {
  const lease = opts.leaseSeconds ?? 300;
  const log = opts.log ?? (() => {});
  const types = Object.keys(handlers) as StepType[];
  const step = await queue.claim(opts.workerId, types, lease);
  if (!step) return "idle";

  const job = await queue.jobContext(step.job_id);
  const controller = new AbortController();
  const beat = setInterval(() => {
    queue.heartbeat(step.id, opts.workerId, lease).then((ok) => { if (!ok) controller.abort(); }, () => {});
  }, Math.max(1000, (lease * 1000) / 3));

  try {
    const handler = handlers[step.step_type];
    if (!handler) throw new PermanentError(`no_handler:${step.step_type}`);
    const result = await handler(step, job, controller.signal);

    // Coûts enregistrés même si la suite échoue : ils ont été dépensés.
    let withinCap = true;
    for (const u of result.usage) withinCap = (await queue.recordCost(step.job_id, u, step.id)) && withinCap;

    await queue.complete(step.id, opts.workerId, result.output);
    log("step_succeeded", { step: step.id, type: step.step_type, attempt: step.attempts });

    if (!withinCap) {
      await queue.setJobStatus(step.job_id, "failed", "cost_cap_exceeded");
      return "cost_cap_exceeded";
    }
    const fresh = await queue.jobContext(step.job_id);
    if (fresh.cancelRequested || fresh.status === "cancelled") return "cancelled";

    const outcome = { ...result.outcome };
    if (step.step_type === "synthesize_segment") {
      outcome.allSegmentsReady = (await queue.remainingSegments(step.job_id)) === 0;
    }
    const t = nextAfter({
      ...outcome,
      completed: step.step_type,
      completedKey: step.step_key,
      requireOutlineApproval: job.settings["require_outline_approval"] !== false,
    });
    if (t.status !== fresh.status) await queue.setJobStatus(step.job_id, t.status);
    for (const e of t.enqueue) {
      await queue.enqueue(step.job_id, e.type, e.key ?? "", result.nextInputs?.[e.key ?? ""] ?? {});
    }
    return "succeeded";
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    if (message.includes("lease_lost")) return "lease_lost";
    // Erreur HTTP : classée par statut. Erreur inconnue : réessayée (le nombre d'essais reste borné en base).
    const status = (err as { status?: unknown })?.status;
    const retryable = !(err instanceof PermanentError) && (typeof status === "number" ? isRetryable(err) : true);
    try {
      const s = await queue.fail(step.id, opts.workerId, message, retryable);
      log("step_failed", { step: step.id, type: step.step_type, attempt: step.attempts, retryable, next: s });
      return s === "dead" ? "dead" : "retry_scheduled";
    } catch (e) {
      if (String(e).includes("lease_lost")) return "lease_lost";
      throw e;
    }
  } finally {
    clearInterval(beat);
  }
}
