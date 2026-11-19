import type { EpisodeStatus, StepType } from "@app/contracts";

/**
 * Graphe du pipeline : à la fin d'une étape, quel statut adopter et quelles
 * étapes planifier. Logique pure, exécutée par l'orchestrateur, qui appelle
 * ensuite set_job_status / enqueue_step (idempotents) en base.
 */
export interface StepOutcome {
  completed: StepType;
  /** Clé de l'étape terminée (ex. « rewrite-1 ») : la vérification suit la même clé. */
  completedKey?: string;
  requireOutlineApproval: boolean;
  /** Pour 'verify' : des affirmations rejetées imposent une réécriture. */
  rewriteNeeded?: boolean;
  /** Pour 'write'/'verify' : nombre de segments vocaux du script retenu. */
  segmentKeys?: readonly string[];
  /** Pour 'synthesize_segment' : tous les segments sont-ils prêts ? */
  allSegmentsReady?: boolean;
  /** Nombre de réécritures déjà effectuées (borne anti-boucle). */
  rewrites?: number;
}

export interface Transition {
  status: EpisodeStatus;
  enqueue: ReadonlyArray<{ type: StepType; key?: string }>;
}

export const MAX_REWRITES = 1;

export function nextAfter(o: StepOutcome): Transition {
  switch (o.completed) {
    case "intent":
      return { status: "researching", enqueue: [{ type: "research" }] };
    case "research":
      return { status: "researching", enqueue: [{ type: "evaluate_sources" }] };
    case "evaluate_sources":
      return { status: "outlining", enqueue: [{ type: "outline" }] };
    case "outline":
      return o.requireOutlineApproval
        ? { status: "awaiting_approval", enqueue: [] } // reprise par approve_outline()
        : { status: "writing", enqueue: [{ type: "write" }] };
    case "write":
      return { status: "verifying", enqueue: [{ type: "verify", key: o.completedKey ?? "" }] };
    case "verify": {
      if (o.rewriteNeeded && (o.rewrites ?? 0) < MAX_REWRITES) {
        return { status: "writing", enqueue: [{ type: "write", key: `rewrite-${(o.rewrites ?? 0) + 1}` }] };
      }
      const keys = o.segmentKeys ?? [];
      if (keys.length === 0) throw new Error("verify: aucun segment à synthétiser");
      return { status: "synthesizing", enqueue: keys.map((key) => ({ type: "synthesize_segment" as const, key })) };
    }
    case "synthesize_segment":
      return o.allSegmentsReady
        ? { status: "assembling", enqueue: [{ type: "assemble" }] }
        : { status: "synthesizing", enqueue: [] };
    case "assemble":
      return { status: "ready", enqueue: [] };
  }
}

/** Backoff exponentiel avec gigue complète, côté worker (le SQL applique un plancher). */
export function backoffMs(attempt: number, baseMs = 30_000, capMs = 3_600_000, random = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** Classe une erreur fournisseur : réessayable (réseau, 429, 5xx) ou définitive. */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(code);
}
