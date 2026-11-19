import { segmentKey, type TtsProvider } from "@app/pipeline";
import type pg from "pg";
import { PermanentError, type StepHandler } from "./runner.js";

/** Stockage des fichiers audio (Supabase Storage en production, dossier local en dev/tests). */
export interface AudioStore {
  readonly bucket: string;
  put(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  /** Supprime des fichiers ; un fichier déjà absent n'est pas une erreur. */
  remove(paths: readonly string[]): Promise<void>;
  /** Liste récursivement les fichiers sous un dossier (chemin se terminant par /). */
  list(prefix: string): Promise<string[]>;
}

/** Entrée d'une étape synthesize_segment, fournie par l'étape de vérification. */
export interface SegmentInput {
  text: string;
  locale: string;
  sectionId?: string;
  position: number;
}

function parseInput(raw: Record<string, unknown>): SegmentInput {
  const { text, locale, position, sectionId } = raw;
  if (typeof text !== "string" || !text || typeof locale !== "string" || typeof position !== "number") {
    throw new PermanentError("invalid_segment_input");
  }
  return { text, locale, position, ...(typeof sectionId === "string" ? { sectionId } : {}) };
}

/**
 * VoiceEngine : synthétise un segment, sauf si un audio prêt existe déjà pour
 * le même texte et la même voix (reprise sans coût, dossier §9).
 */
export function synthesizeSegmentHandler(deps: { pool: pg.Pool; tts: TtsProvider; store: AudioStore }): StepHandler {
  return async (step, _job, signal) => {
    const input = parseInput(step.input);
    const voiceId = deps.tts.voiceFor(input.locale);
    const key = segmentKey(input.text, { voiceId, speechRate: "native", locale: input.locale });

    const existing = await deps.pool.query<{ id: string; storage_path: string }>(
      `select id, storage_path from public.audio_assets
        where episode_id = $1 and kind = 'segment' and status = 'ready' and text_sha256 = $2 and voice_id = $3 limit 1`,
      [step.episode_id, key, voiceId],
    );
    if (existing.rows[0]) {
      return { output: { assetId: existing.rows[0].id, reused: true }, usage: [] };
    }

    const result = await deps.tts.synthesize({ text: input.text, locale: input.locale, voiceId, speechRate: "moderate" }, signal);
    const path = `${step.user_id}/${step.episode_id}/segments/${String(input.position).padStart(4, "0")}-${key.slice(0, 16)}.mp3`;
    await deps.store.put(path, result.audio, result.mimeType);
    const { rows } = await deps.pool.query<{ id: string }>(
      `insert into public.audio_assets (episode_id, user_id, section_id, kind, status, storage_bucket, storage_path,
                                        mime_type, duration_ms, byte_size, tts_provider, voice_id, text_sha256)
       values ($1, $2, $3, 'segment', 'ready', $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (storage_bucket, storage_path) do update set status = 'ready'
       returning id`,
      [step.episode_id, step.user_id, input.sectionId ?? null, deps.store.bucket, path, result.mimeType,
       result.durationMs, result.audio.byteLength, deps.tts.id, voiceId, key],
    );
    return { output: { assetId: rows[0]!.id, reused: false, durationMs: result.durationMs }, usage: result.usage };
  };
}
