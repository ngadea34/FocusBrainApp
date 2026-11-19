import type pg from "pg";
import { PermanentError, type StepHandler } from "./runner.js";
import type { AudioStore } from "./synthesis.js";

/**
 * Retire les étiquettes ID3 (v2 en tête, v1 en fin) d'un fichier MP3. Les trames
 * MP3 sont autonomes : des segments de même voix et même format se concatènent
 * sans réencodage, ce qui évite d'embarquer ffmpeg dans le worker.
 */
export function stripId3(mp3: Uint8Array): Uint8Array {
  let start = 0;
  let end = mp3.length;
  if (end >= 10 && mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33) { // "ID3"
    const size = ((mp3[6]! & 0x7f) << 21) | ((mp3[7]! & 0x7f) << 14) | ((mp3[8]! & 0x7f) << 7) | (mp3[9]! & 0x7f);
    const footer = (mp3[5]! & 0x10) !== 0 ? 10 : 0;
    start = Math.min(end, 10 + size + footer);
  }
  if (end - start >= 128 && mp3[end - 128] === 0x54 && mp3[end - 127] === 0x41 && mp3[end - 126] === 0x47) end -= 128; // "TAG"
  return mp3.subarray(start, end);
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export interface AssembledSegment { durationMs: number; chapterTitle: string | null; sectionId: string | null }

/** Chapitres : un par section, au début de son premier segment. */
export function chaptersFor(segments: readonly AssembledSegment[]): { title: string; start_ms: number }[] {
  const chapters: { title: string; start_ms: number }[] = [];
  let t = 0;
  let previous: string | null | undefined;
  for (const s of segments) {
    if (s.sectionId !== previous && s.chapterTitle) chapters.push({ title: s.chapterTitle, start_ms: t });
    previous = s.sectionId;
    t += s.durationMs;
  }
  return chapters;
}

/**
 * AssemblyEngine : met bout à bout les segments de CETTE génération (sorties des
 * étapes synthesize_segment réussies, dans l'ordre des clés), dépose le fichier
 * complet, l'enregistre avec ses chapitres et fixe la durée de l'épisode.
 * Idempotent : relancé, il réécrit le même fichier et la même ligne.
 */
export function assembleHandler(deps: { pool: pg.Pool; store: AudioStore }): StepHandler {
  return async (step) => {
    const { rows } = await deps.pool.query<{ storage_path: string; duration_ms: number | null; section_id: string | null; chapter_title: string | null }>(
      `select a.storage_path, a.duration_ms, a.section_id, sec.chapter_title
         from public.generation_steps g
         join public.audio_assets a on a.id = (g.output->>'assetId')::uuid
         left join public.script_sections sec on sec.id = a.section_id
        where g.job_id = $1 and g.step_type = 'synthesize_segment' and g.status = 'succeeded'
        order by g.step_key`, [step.job_id]);
    if (rows.length === 0) throw new PermanentError("no_segments");
    if (rows.some((r) => r.duration_ms == null)) throw new PermanentError("segment_without_duration");

    const parts: Uint8Array[] = [];
    for (const r of rows) parts.push(stripId3(await deps.store.get(r.storage_path)));
    const audio = concatBytes(parts);
    const segments = rows.map((r) => ({ durationMs: r.duration_ms!, chapterTitle: r.chapter_title, sectionId: r.section_id }));
    const durationMs = segments.reduce((n, s) => n + s.durationMs, 0);
    const chapters = chaptersFor(segments);
    const path = `${step.user_id}/${step.episode_id}/episode.mp3`;
    await deps.store.put(path, audio, "audio/mpeg");

    const client = await deps.pool.connect();
    try {
      await client.query("begin");
      const { rows: [asset] } = await client.query<{ id: string }>(
        `insert into public.audio_assets (episode_id, user_id, kind, status, storage_bucket, storage_path, mime_type, duration_ms, byte_size, chapters)
         values ($1, $2, 'full', 'ready', $3, $4, 'audio/mpeg', $5, $6, $7)
         on conflict (storage_bucket, storage_path) do update
           set status = 'ready', duration_ms = excluded.duration_ms, byte_size = excluded.byte_size, chapters = excluded.chapters
         returning id`,
        [step.episode_id, step.user_id, deps.store.bucket, path, durationMs, audio.byteLength, JSON.stringify(chapters)]);
      await client.query("update public.episodes set duration_ms = $2 where id = $1", [step.episode_id, durationMs]);
      await client.query("commit");
      return { output: { assetId: asset!.id, segments: rows.length, durationMs, chapters: chapters.length }, usage: [] };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  };
}
