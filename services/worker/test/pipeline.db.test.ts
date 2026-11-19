/**
 * Tests de bout en bout du worker contre les vraies fonctions SQL
 * (base créée par supabase/tests/run.sh). Moteurs factices, sauf la synthèse
 * vocale qui utilise le vrai gestionnaire avec un faux fournisseur TTS.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { segmentKey, toMicros, type TtsProvider, type TtsRequest, type TtsResult } from "@app/pipeline";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Handlers, LocalDirStore, PermanentError, PgQueue, type RunResult, runOnce, synthesizeSegmentHandler,
} from "../src/index.js";

const pool = new pg.Pool({ database: process.env.TEST_DB ?? "app_test", max: 4 });
const queue = new PgQueue(pool);
afterAll(() => pool.end());

class FakeTts implements TtsProvider {
  readonly id = "fake-tts";
  calls: string[] = [];
  failNext: number[] = []; // statuts HTTP à renvoyer avant de réussir
  voiceFor(locale: string) { return `voice-${locale}`; }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    this.calls.push(req.text);
    const status = this.failNext.shift();
    if (status) throw Object.assign(new Error(`tts_${status}`), { status });
    const audio = new Uint8Array(4000); audio.set([0xff, 0xfb, 0x50, 0x00]);
    return { audio, mimeType: "audio/mpeg", durationMs: 500,
      usage: [{ category: "tts", provider: this.id, units: req.text.length, unit: "characters", amountMicros: toMicros(req.text.length * 30 / 1e6) }] };
  }
}

const SEGMENTS = ["Premier segment.", "Deuxième segment.", "Troisième segment."];
const llm = (amountMicros = 1000) => [{ category: "llm" as const, provider: "fake-llm", units: 100, unit: "tokens_out", amountMicros }];

function handlers(tts: FakeTts, store: LocalDirStore, overrides: Handlers = {}): Handlers {
  const simple = async () => ({ output: {}, usage: llm() });
  return {
    intent: simple, research: simple, evaluate_sources: simple, outline: simple, write: simple,
    verify: async () => {
      const keys = SEGMENTS.map((_, i) => `seg-${i}`);
      return {
        output: {}, usage: llm(),
        outcome: { rewriteNeeded: false, segmentKeys: keys },
        nextInputs: Object.fromEntries(keys.map((k, i) => [k, { text: SEGMENTS[i], locale: "fr-FR", position: i }])),
      };
    },
    synthesize_segment: synthesizeSegmentHandler({ pool, tts, store }),
    assemble: async () => ({ output: { assembled: true }, usage: [] }),
    ...overrides,
  };
}

/** Crée un utilisateur et lance une génération comme le ferait l'application. */
async function startJob(opts: { approval?: boolean } = {}): Promise<{ jobId: string; episodeId: string; userId: string }> {
  const c = await pool.connect();
  try {
    const { rows: [u] } = await c.query<{ id: string }>("insert into auth.users (id, email) values (gen_random_uuid(), 'w@test.local') returning id");
    const { rows: [e] } = await c.query<{ id: string }>(
      "insert into public.episodes (user_id, topic_prompt) values ($1, 'Sujet de test') returning id", [u!.id]);
    await c.query("insert into public.episode_settings (episode_id, user_id, duration_minutes, require_outline_approval) values ($1, $2, 5, $3)",
      [e!.id, u!.id, opts.approval ?? false]);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: u!.id, role: "authenticated" })]);
    const { rows: [j] } = await c.query<{ id: string }>("select public.request_generation($1, $2) as id", [e!.id, `k-${e!.id}`]);
    await c.query("select set_config('request.jwt.claims', '', false)");
    return { jobId: j!.id, episodeId: e!.id, userId: u!.id };
  } finally {
    c.release();
  }
}

/** Fait tourner le worker jusqu'à ce qu'il n'y ait plus rien à faire ; avance le temps des retries. */
async function drain(h: Handlers, jobId: string, max = 50): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let i = 0; i < max; i++) {
    const r = await runOnce(queue, h, { workerId: "w-test" });
    if (r === "idle") {
      const { rowCount } = await pool.query(
        "update public.generation_steps set next_attempt_at = now() where job_id = $1 and status = 'pending' and next_attempt_at > now()", [jobId]);
      if (!rowCount) break;
      continue;
    }
    results.push(r);
  }
  return results;
}

const status = async (jobId: string) =>
  (await pool.query<{ status: string; error_code: string | null }>("select status, error_code from public.episode_jobs where id = $1", [jobId])).rows[0]!;

let store: LocalDirStore;
beforeAll(async () => {
  store = new LocalDirStore(await mkdtemp(join(tmpdir(), "audio-")));
  // Isole chaque fichier de test des tâches laissées par d'autres exécutions.
  await pool.query("update public.episode_jobs set status = 'cancelled' where status not in ('ready','failed','cancelled')");
});

describe("worker de bout en bout", () => {
  it("mène une génération jusqu'à « ready », avec un retry sur erreur 503", async () => {
    const tts = new FakeTts();
    tts.failNext = [503];
    const { jobId, episodeId } = await startJob();
    const results = await drain(handlers(tts, store), jobId);

    expect(await status(jobId)).toMatchObject({ status: "ready" });
    expect(results).toContain("retry_scheduled");
    expect(tts.calls).toHaveLength(SEGMENTS.length + 1);
    const assets = await pool.query("select * from public.audio_assets where episode_id = $1 and kind = 'segment'", [episodeId]);
    expect(assets.rowCount).toBe(SEGMENTS.length);
    const costs = await pool.query<{ llm_micros: string; tts_micros: string }>(
      "select llm_micros, tts_micros from public.admin_job_costs where job_id = $1", [jobId]);
    expect(Number(costs.rows[0]!.llm_micros)).toBe(6 * 1000);
    expect(Number(costs.rows[0]!.tts_micros)).toBeGreaterThan(0);
  });

  it("ne resynthétise pas un segment déjà produit (reprise sans coût)", async () => {
    const tts = new FakeTts();
    const { jobId, episodeId, userId } = await startJob();
    const key = segmentKey(SEGMENTS[1]!, { voiceId: "voice-fr-FR", speechRate: "native", locale: "fr-FR" });
    await pool.query(
      `insert into public.audio_assets (episode_id, user_id, kind, status, storage_path, voice_id, text_sha256)
       values ($1, $2, 'segment', 'ready', $3, 'voice-fr-FR', $4)`,
      [episodeId, userId, `${userId}/${episodeId}/segments/old.mp3`, key]);
    await drain(handlers(tts, store), jobId);
    expect(await status(jobId)).toMatchObject({ status: "ready" });
    expect(tts.calls).toEqual([SEGMENTS[0], SEGMENTS[2]]);
  });

  it("attend la validation du plan quand elle est demandée", async () => {
    const tts = new FakeTts();
    const { jobId } = await startJob({ approval: true });
    await drain(handlers(tts, store), jobId);
    expect(await status(jobId)).toMatchObject({ status: "awaiting_approval" });
    expect(tts.calls).toHaveLength(0);
  });

  it("une erreur définitive envoie l'étape en dead-letter et rembourse le quota", async () => {
    const tts = new FakeTts();
    const { jobId, userId } = await startJob();
    const results = await drain(handlers(tts, store, {
      research: async () => { throw new PermanentError("source_refused"); },
    }), jobId);
    expect(results).toContain("dead");
    expect(await status(jobId)).toMatchObject({ status: "failed", error_code: "step_dead:research" });
    const q = await pool.query<{ generations_used: number }>("select generations_used from public.quota_usage where user_id = $1", [userId]);
    expect(q.rows[0]!.generations_used).toBe(0);
  });

  it("une erreur inconnue est réessayée puis abandonnée après 3 essais", async () => {
    const tts = new FakeTts();
    const { jobId } = await startJob();
    let calls = 0;
    await drain(handlers(tts, store, { outline: async () => { calls++; throw new Error("bug"); } }), jobId);
    expect(calls).toBe(3);
    expect(await status(jobId)).toMatchObject({ status: "failed" });
  });

  it("arrête la génération quand le plafond de coût est dépassé", async () => {
    const tts = new FakeTts();
    const { jobId } = await startJob();
    const results = await drain(handlers(tts, store, {
      write: async () => ({ output: {}, usage: llm(toMicros(3)) }),
    }), jobId);
    expect(results).toContain("cost_cap_exceeded");
    expect(await status(jobId)).toMatchObject({ status: "failed", error_code: "cost_cap_exceeded" });
    expect(tts.calls).toHaveLength(0);
  });

  it("s'arrête proprement si l'utilisateur annule pendant une étape", async () => {
    const tts = new FakeTts();
    const { jobId, episodeId, userId } = await startJob();
    const results = await drain(handlers(tts, store, {
      research: async () => {
        const c = await pool.connect();
        await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId })]);
        await c.query("select public.cancel_generation($1)", [episodeId]);
        await c.query("select set_config('request.jwt.claims', '', false)");
        c.release();
        return { output: {}, usage: llm() };
      },
    }), jobId);
    expect(results.at(-1)).toBe("cancelled");
    expect(await status(jobId)).toMatchObject({ status: "cancelled" });
    const pending = await pool.query("select 1 from public.generation_steps where job_id = $1 and status = 'pending'", [jobId]);
    expect(pending.rowCount).toBe(0);
  });

  it("reprend une étape après le crash d'un worker (bail expiré) et refuse la fin tardive", async () => {
    const tts = new FakeTts();
    const { jobId } = await startJob();
    const crashed = await queue.claim("w-crash", ["intent"], 300);
    expect(crashed?.job_id).toBe(jobId);
    await pool.query("update public.generation_steps set locked_until = now() - interval '1 second' where id = $1", [crashed!.id]);
    await drain(handlers(tts, store), jobId);
    expect(await status(jobId)).toMatchObject({ status: "ready" });
    await expect(queue.complete(crashed!.id, "w-crash", {})).rejects.toThrow(/lease_lost/);
    const { rows: [st] } = await pool.query<{ attempts: number }>("select attempts from public.generation_steps where id = $1", [crashed!.id]);
    expect(st!.attempts).toBe(2);
  });
});
