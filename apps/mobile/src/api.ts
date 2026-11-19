/**
 * Accès aux données depuis l'application. Tout passe par la clé publique et la
 * session de l'utilisateur : la RLS et les droits par colonne bornent ce qui est
 * lisible ou modifiable. Aucune logique métier sensible ici (quotas, coûts et
 * transitions sont vérifiés côté SQL par request_generation & co).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DensityLevel, DepthLevel, DigressionLevel, EpisodeStatus, NarrationTone, RepetitionLevel, StructureKind,
} from "@app/contracts";
import { SIGNED_URL_TTL_SECONDS } from "./config";

export const AUDIO_BUCKET = "episode-audio";

export interface EpisodeRow {
  id: string;
  title: string | null;
  topic_prompt: string;
  status: EpisodeStatus;
  output_locale: string;
  duration_ms: number | null;
  created_at: string;
}

export interface OutlineSection { title: string; goal?: string; concepts?: string[]; estimatedMinutes?: number }
export interface OutlineRow { id: string; version: number; content: { sections: OutlineSection[]; openQuestions?: string[] }; approved_at: string | null }
export interface Chapter { title: string; start_ms: number }
export interface AudioAssetRow {
  id: string; kind: "segment" | "full"; storage_path: string; duration_ms: number | null; created_at: string; chapters?: Chapter[] | null;
}
export interface SourceRow {
  quality_tier: number;
  limitations: string | null;
  sources: { title: string; url: string | null; doi: string | null; citation: string | null; license_code: string | null } | null;
}
export interface StepRow { step_type: string; status: string }

export interface EpisodeDetail {
  episode: EpisodeRow;
  outline: OutlineRow | null;
  audio: AudioAssetRow[];
  sources: SourceRow[];
  steps: StepRow[];
}

/** Réglages fins choisis à la création (la vitesse de la voix se règle au lecteur). */
export interface FineSettings {
  depth: DepthLevel;
  density: DensityLevel;
  structure: StructureKind;
  digressions: DigressionLevel;
  repetition: RepetitionLevel;
  tone: NarrationTone;
}

export interface NewEpisodeInput {
  fine?: Partial<FineSettings>;
  topic: string;
  outputLocale: string;
  durationMinutes: number;
  requireOutlineApproval: boolean;
  idempotencyKey: string;
}

/** Erreurs connues renvoyées par les fonctions SQL, traduites par l'interface. */
export const KNOWN_ERRORS = [
  "quota_exceeded", "too_many_active_jobs", "duration_not_allowed", "no_plan_configured",
  "invalid_state", "episode_not_found", "not_authenticated", "episode_locked",
] as const;
export type KnownError = (typeof KNOWN_ERRORS)[number] | "unknown";

export class AppError extends Error {
  constructor(readonly code: KnownError, message: string) { super(message); }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const message = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const code = KNOWN_ERRORS.find((k) => message.startsWith(k)) ?? "unknown";
  return new AppError(code, message);
}

function check<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw toAppError(r.error);
  return r.data as T;
}

/** On cherche toujours dans les deux langues de lancement, la langue de sortie d'abord. */
export function researchLocalesFor(outputLocale: string): string[] {
  return outputLocale.startsWith("fr") ? [outputLocale, "en-GB"] : [outputLocale, "fr-FR"];
}

export function titleFromTopic(topic: string): string {
  const t = topic.trim().replace(/\s+/g, " ");
  return t.length <= 80 ? t : `${t.slice(0, 79).trimEnd()}…`;
}

export async function createEpisode(sb: SupabaseClient, input: NewEpisodeInput): Promise<{ episodeId: string; jobId: string }> {
  const topic = input.topic.trim();
  if (topic.length < 3) throw new AppError("unknown", "topic_too_short");
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new AppError("not_authenticated", "not_authenticated");
  const ep = check(await sb.from("episodes").insert({
    user_id: user.id,
    title: titleFromTopic(topic),
    topic_prompt: topic,
    output_locale: input.outputLocale,
    research_locales: researchLocalesFor(input.outputLocale),
  }).select("id").single<{ id: string }>());
  try {
    check(await sb.from("episode_settings").insert({
      episode_id: ep.id,
      user_id: user.id,
      duration_minutes: input.durationMinutes,
      require_outline_approval: input.requireOutlineApproval,
      ...input.fine,
    }));
    const jobId = await requestGeneration(sb, ep.id, input.idempotencyKey);
    return { episodeId: ep.id, jobId };
  } catch (e) {
    // Refus (quota, durée…) : on ne laisse pas de brouillon orphelin dans la bibliothèque.
    await sb.from("episodes").delete().eq("id", ep.id);
    throw toAppError(e);
  }
}

export async function requestGeneration(sb: SupabaseClient, episodeId: string, idempotencyKey: string): Promise<string> {
  return check(await sb.rpc("request_generation", { p_episode_id: episodeId, p_idempotency_key: idempotencyKey })) as string;
}

export async function listEpisodes(sb: SupabaseClient): Promise<EpisodeRow[]> {
  return check(await sb.from("episodes")
    .select("id, title, topic_prompt, status, output_locale, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(100)) as EpisodeRow[];
}

export async function getEpisodeDetail(sb: SupabaseClient, id: string): Promise<EpisodeDetail> {
  const [episode, outlines, audio, sources, steps] = await Promise.all([
    sb.from("episodes").select("id, title, topic_prompt, status, output_locale, duration_ms, created_at").eq("id", id).single<EpisodeRow>(),
    sb.from("outline_versions").select("id, version, content, approved_at").eq("episode_id", id).order("version", { ascending: false }).limit(1),
    sb.from("audio_assets").select("id, kind, storage_path, duration_ms, created_at, chapters").eq("episode_id", id).eq("status", "ready").in("kind", ["segment", "full"]),
    sb.from("episode_sources").select("quality_tier, limitations, sources(title, url, doi, citation, license_code)")
      .eq("episode_id", id).eq("retained", true).order("quality_tier", { ascending: true }),
    sb.from("generation_steps").select("step_type, status").eq("episode_id", id),
  ]);
  return {
    episode: check(episode),
    outline: (check(outlines) as OutlineRow[])[0] ?? null,
    audio: check(audio) as AudioAssetRow[],
    sources: check(sources) as unknown as SourceRow[],
    steps: check(steps) as StepRow[],
  };
}

export async function approveOutline(sb: SupabaseClient, episodeId: string): Promise<void> {
  check(await sb.rpc("approve_outline", { p_episode_id: episodeId }));
}

export async function cancelGeneration(sb: SupabaseClient, episodeId: string): Promise<void> {
  check(await sb.rpc("cancel_generation", { p_episode_id: episodeId }));
}

/**
 * Ce qu'on joue : le fichier complet s'il existe, sinon les segments dans l'ordre.
 * Le chemin d'un segment commence par sa position sur 4 chiffres ; après une
 * réécriture, plusieurs fichiers peuvent porter la même position : on garde le plus récent.
 */
export function playbackPaths(assets: readonly AudioAssetRow[]): string[] {
  const full = assets.filter((a) => a.kind === "full").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (full) return [full.storage_path];
  const byPosition = new Map<string, AudioAssetRow>();
  for (const a of assets) {
    if (a.kind !== "segment") continue;
    const m = /\/segments\/(\d{4})-[^/]+$/.exec(a.storage_path);
    if (!m) continue;
    const prev = byPosition.get(m[1]!);
    if (!prev || a.created_at > prev.created_at) byPosition.set(m[1]!, a);
  }
  return [...byPosition.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, a]) => a.storage_path);
}

export async function signedUrls(sb: SupabaseClient, paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const rows = check(await sb.storage.from(AUDIO_BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS)) as
    { path: string | null; signedUrl: string; error: string | null }[];
  const byPath = new Map(rows.map((r) => [r.path, r]));
  return paths.map((p) => {
    const r = byPath.get(p);
    if (!r || r.error || !r.signedUrl) throw new AppError("unknown", `signed_url_failed: ${p}`);
    return r.signedUrl;
  });
}

/** Avancement affichable : étapes terminées / étapes connues (les étapes apparaissent au fil de l'eau). */
export function progressOf(steps: readonly StepRow[]): { done: number; total: number } {
  const counted = steps.filter((s) => s.status !== "cancelled");
  return { done: counted.filter((s) => s.status === "succeeded").length, total: counted.length };
}

export const ACTIVE_STATUSES: readonly EpisodeStatus[] = [
  "queued", "researching", "outlining", "writing", "verifying", "synthesizing", "assembling",
];
export const isActive = (s: EpisodeStatus) => ACTIVE_STATUSES.includes(s);

/** Fichier complet prêt, s'il existe (après l'étape de montage). */
export function fullAsset(assets: readonly AudioAssetRow[]): AudioAssetRow | null {
  return assets.filter((a) => a.kind === "full").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/** Index du chapitre en cours à une position donnée (-1 avant le premier). */
export function chapterAt(chapters: readonly Chapter[], positionMs: number): number {
  let idx = -1;
  chapters.forEach((c, i) => { if (c.start_ms <= positionMs) idx = i; });
  return idx;
}

export interface Progress { positionMs: number; chapterIndex: number | null; playbackRate: number; completed: boolean }

export async function getProgress(sb: SupabaseClient, episodeId: string): Promise<Progress | null> {
  const rows = check(await sb.from("listening_progress").select("position_ms, chapter_index, playback_rate, completed_at")
    .eq("episode_id", episodeId).limit(1)) as { position_ms: number; chapter_index: number | null; playback_rate: string | number | null; completed_at: string | null }[];
  const r = rows[0];
  if (!r) return null;
  return { positionMs: r.position_ms, chapterIndex: r.chapter_index, playbackRate: Number(r.playback_rate ?? 1), completed: !!r.completed_at };
}

/**
 * Enregistre la position d'écoute. Mise à jour d'abord, insertion sinon : un upsert
 * réécrirait aussi les clés, que l'utilisateur n'a pas le droit de modifier.
 */
export async function saveProgress(sb: SupabaseClient, episodeId: string, p: Progress): Promise<void> {
  const values = {
    position_ms: Math.max(0, Math.round(p.positionMs)),
    chapter_index: p.chapterIndex != null && p.chapterIndex >= 0 ? p.chapterIndex : null,
    playback_rate: Math.min(2, Math.max(0.5, p.playbackRate)),
    completed_at: p.completed ? new Date().toISOString() : null,
  };
  const updated = check(await sb.from("listening_progress").update(values).eq("episode_id", episodeId).select("episode_id")) as unknown[];
  if (updated.length > 0) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new AppError("not_authenticated", "not_authenticated");
  check(await sb.from("listening_progress").insert({ user_id: user.id, episode_id: episodeId, ...values }));
}
