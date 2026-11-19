import type { CostCategory, EpisodeStatus, StepStatus, StepType } from "@app/contracts";
import type { UsageRecord } from "@app/pipeline";
import pg from "pg";

/** Étape telle que renvoyée par public.claim_step. */
export interface ClaimedStep {
  id: string;
  job_id: string;
  episode_id: string;
  user_id: string;
  step_type: StepType;
  step_key: string;
  attempts: number;
  max_attempts: number;
  input: Record<string, unknown>;
}

/**
 * Accès à la file de tâches. Chaque méthode appelle une fonction SQL de
 * supabase/migrations (aucune logique dupliquée côté TypeScript) : les
 * garanties d'idempotence, de bail et de retry sont celles de la base.
 */
export interface StepQueue {
  claim(workerId: string, types: readonly StepType[], leaseSeconds: number): Promise<ClaimedStep | null>;
  heartbeat(stepId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  complete(stepId: string, workerId: string, output: unknown): Promise<void>;
  fail(stepId: string, workerId: string, error: string, retryable: boolean): Promise<StepStatus>;
  enqueue(jobId: string, type: StepType, key?: string, input?: unknown): Promise<string>;
  setJobStatus(jobId: string, status: EpisodeStatus, errorCode?: string, errorMessage?: string): Promise<void>;
  /** Renvoie false si le plafond de coût de l'épisode est dépassé. */
  recordCost(jobId: string, usage: UsageRecord, stepId?: string): Promise<boolean>;
  jobContext(jobId: string): Promise<JobContext>;
  /** Segments vocaux de la tâche pas encore réussis. */
  remainingSegments(jobId: string): Promise<number>;
}

export interface JobContext {
  status: EpisodeStatus;
  cancelRequested: boolean;
  settings: Record<string, unknown>;
}

export class PgQueue implements StepQueue {
  constructor(private readonly pool: pg.Pool) {}

  async claim(workerId: string, types: readonly StepType[], leaseSeconds: number): Promise<ClaimedStep | null> {
    const { rows } = await this.pool.query<ClaimedStep>(
      "select * from public.claim_step($1, $2::public.step_type[], $3)",
      [workerId, types, leaseSeconds],
    );
    return rows[0] ?? null;
  }

  async heartbeat(stepId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean | null }>(
      "select public.heartbeat_step($1, $2, $3) as ok",
      [stepId, workerId, leaseSeconds],
    );
    return rows[0]?.ok === true;
  }

  async complete(stepId: string, workerId: string, output: unknown): Promise<void> {
    await this.pool.query("select public.complete_step($1, $2, $3::jsonb)", [stepId, workerId, JSON.stringify(output ?? {})]);
  }

  async fail(stepId: string, workerId: string, error: string, retryable: boolean): Promise<StepStatus> {
    const { rows } = await this.pool.query<{ s: StepStatus }>(
      "select public.fail_step($1, $2, $3, $4) as s",
      [stepId, workerId, error, retryable],
    );
    return rows[0]!.s;
  }

  async enqueue(jobId: string, type: StepType, key = "", input: unknown = {}): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      "select public.enqueue_step($1, $2::public.step_type, $3, $4::jsonb) as id",
      [jobId, type, key, JSON.stringify(input)],
    );
    return rows[0]!.id;
  }

  async setJobStatus(jobId: string, status: EpisodeStatus, errorCode?: string, errorMessage?: string): Promise<void> {
    await this.pool.query("select public.set_job_status($1, $2::public.episode_status, $3, $4)", [
      jobId, status, errorCode ?? null, errorMessage ?? null,
    ]);
  }

  async recordCost(jobId: string, u: UsageRecord, stepId?: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      "select public.record_cost($1, $2::public.cost_category, $3, $4, $5, $6, $7, $8) as ok",
      [jobId, u.category satisfies CostCategory, u.provider, u.units, u.unit, u.amountMicros, u.model ?? null, stepId ?? null],
    );
    return rows[0]!.ok;
  }

  async jobContext(jobId: string): Promise<JobContext> {
    const { rows } = await this.pool.query<{ status: EpisodeStatus; cancel_requested_at: Date | null; settings_snapshot: Record<string, unknown> }>(
      "select status, cancel_requested_at, settings_snapshot from public.episode_jobs where id = $1",
      [jobId],
    );
    const r = rows[0];
    if (!r) throw new Error(`job_not_found: ${jobId}`);
    return { status: r.status, cancelRequested: r.cancel_requested_at !== null, settings: r.settings_snapshot };
  }

  async remainingSegments(jobId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      "select count(*) as n from public.generation_steps where job_id = $1 and step_type = 'synthesize_segment' and status <> 'succeeded'",
      [jobId],
    );
    return Number(rows[0]!.n);
  }
}
