/**
 * Montage final et boucle du worker, contre les vraies fonctions SQL (base locale
 * créée par supabase/tests/run.sh). Synthèse et montage réels, stockage sur disque.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toMicros, type TtsProvider, type TtsRequest, type TtsResult } from "@app/pipeline";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assembleHandler, type Handlers, LocalDirStore, PgQueue, reapExpiredSteps, runLoop, runOnce, stripId3, synthesizeSegmentHandler,
} from "../src/index.js";

const pool = new pg.Pool({ database: process.env.TEST_DB ?? "app_test", max: 4 });
const queue = new PgQueue(pool);
afterAll(() => pool.end());

/** Faux TTS : renvoie un « MP3 » avec une étiquette ID3v2, comme certains fournisseurs. */
class FakeTts implements TtsProvider {
  readonly id = "fake-tts";
  voiceFor(locale: string) { return `voice-${locale}`; }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const id3 = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 3, 1, 2, 3];
    const frames = new TextEncoder().encode(`[${req.text}]`);
    const audio = new Uint8Array([...id3, 0xff, 0xfb, ...frames]);
    return { audio, mimeType: "audio/mpeg", durationMs: 1000 * req.text.length,
      usage: [{ category: "tts", provider: this.id, units: req.text.length, unit: "characters", amountMicros: toMicros(0) }] };
  }
}

const SEGMENTS = ["Un.", "Deux.", "Trois."];
let store: LocalDirStore;

function handlers(): Handlers {
  const simple = async () => ({ output: {}, usage: [] });
  return {
    intent: simple, research: simple, evaluate_sources: simple, outline: simple, write: simple,
    verify: async () => {
      const keys = SEGMENTS.map((_, i) => `${String(i).padStart(4, "0")}-k`);
      return {
        output: {}, usage: [], outcome: { rewriteNeeded: false, segmentKeys: keys },
        nextInputs: Object.fromEntries(keys.map((k, i) => [k, { text: SEGMENTS[i], locale: "fr-FR", position: i }])),
      };
    },
    synthesize_segment: synthesizeSegmentHandler({ pool, tts: new FakeTts(), store }),
    assemble: assembleHandler({ pool, store }),
  };
}

async function startJob(): Promise<{ jobId: string; episodeId: string; userId: string }> {
  const c = await pool.connect();
  try {
    const { rows: [u] } = await c.query<{ id: string }>("insert into auth.users (id, email) values (gen_random_uuid(), 'a@test.local') returning id");
    const { rows: [e] } = await c.query<{ id: string }>("insert into public.episodes (user_id, topic_prompt) values ($1, 'Sujet') returning id", [u!.id]);
    await c.query("insert into public.episode_settings (episode_id, user_id, duration_minutes, require_outline_approval) values ($1, $2, 5, false)", [e!.id, u!.id]);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: u!.id, role: "authenticated" })]);
    const { rows: [j] } = await c.query<{ id: string }>("select public.request_generation($1, $2) as id", [e!.id, `key-${e!.id}`]);
    await c.query("select set_config('request.jwt.claims', '', false)");
    return { jobId: j!.id, episodeId: e!.id, userId: u!.id };
  } finally { c.release(); }
}

beforeAll(async () => {
  store = new LocalDirStore(await mkdtemp(join(tmpdir(), "assemble-")));
  await pool.query("update public.episode_jobs set status = 'cancelled' where status not in ('ready','failed','cancelled')");
});

describe("montage et boucle du worker", () => {
  it("la boucle traite toute la génération, monte un seul MP3 et s'arrête sur demande", async () => {
    const { jobId, episodeId, userId } = await startJob();
    const stop = new AbortController();
    const events: string[] = [];
    let maintenance = 0;
    const done = runLoop(queue, handlers(), stop.signal, {
      workerId: "w-loop", pollMs: 20, maintenanceEveryMs: 60_000, log: (e) => events.push(e),
      maintenance: async () => { maintenance++; await reapExpiredSteps(pool); },
    });
    for (let i = 0; i < 200; i++) {
      const { rows: [j] } = await pool.query<{ status: string }>("select status from public.episode_jobs where id = $1", [jobId]);
      if (j!.status === "ready" || j!.status === "failed") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    stop.abort();
    const { processed } = await done;

    const { rows: [ep] } = await pool.query<{ status: string; duration_ms: number; ready_at: Date | null }>(
      "select status, duration_ms, ready_at from public.episodes where id = $1", [episodeId]);
    expect(ep).toMatchObject({ status: "ready", duration_ms: 1000 * SEGMENTS.join("").length });
    expect(ep!.ready_at).not.toBeNull();
    expect(processed).toBe(6 + SEGMENTS.length + 1);
    expect(maintenance).toBe(1);
    expect(events.at(-1)).toBe("stopped");

    const { rows: full } = await pool.query<{ storage_path: string; duration_ms: number; byte_size: string; chapters: unknown }>(
      "select storage_path, duration_ms, byte_size, chapters from public.audio_assets where episode_id = $1 and kind = 'full'", [episodeId]);
    expect(full).toHaveLength(1);
    expect(full[0]!.storage_path).toBe(`${userId}/${episodeId}/episode.mp3`);
    const bytes = await store.get(full[0]!.storage_path);
    expect(new TextDecoder().decode(bytes.filter((b) => b < 0x80))).toBe("[Un.][Deux.][Trois.]");
    expect(bytes[0]).toBe(0xff); // plus d'étiquette ID3 en tête
    expect(Number(full[0]!.byte_size)).toBe(bytes.length); // bigint : renvoyé en texte par pg
  });

  it("le montage est idempotent : relancé, il réécrit le même fichier et la même ligne", async () => {
    const { jobId, episodeId } = await startJob();
    const h = handlers();
    for (let i = 0; i < 50; i++) if ((await runOnce(queue, h, { workerId: "w-idem" })) === "idle") break;
    const { rows: [step] } = await pool.query("select * from public.generation_steps where job_id = $1 and step_type = 'assemble'", [jobId]);
    const again = await h.assemble!(step, { status: "ready", cancelRequested: false, settings: {} }, new AbortController().signal);
    expect(again.output).toMatchObject({ segments: 3 });
    const { rowCount } = await pool.query("select 1 from public.audio_assets where episode_id = $1 and kind = 'full'", [episodeId]);
    expect(rowCount).toBe(1);
  });
});

describe("ID3", () => {
  it("retire une étiquette v1 en fin de fichier", () => {
    const tag = new Uint8Array(128); tag.set([0x54, 0x41, 0x47]);
    expect([...stripId3(new Uint8Array([0xff, 0xfb, 1, 2, ...tag]))]).toEqual([0xff, 0xfb, 1, 2]);
  });
});
