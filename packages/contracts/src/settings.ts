import { z } from "zod";
import {
  DENSITY_LEVELS,
  DEPTH_LEVELS,
  DIGRESSION_LEVELS,
  DURATIONS_MINUTES,
  NARRATION_TONES,
  REPETITION_LEVELS,
  SPEECH_RATES,
  STRUCTURE_KINDS,
} from "./enums.js";
import { localeTag } from "./locale.js";

export const episodeSettingsSchema = z
  .object({
    durationMinutes: z.union(DURATIONS_MINUTES.map((d) => z.literal(d))),
    depth: z.enum(DEPTH_LEVELS),
    density: z.enum(DENSITY_LEVELS),
    structure: z.enum(STRUCTURE_KINDS),
    digressions: z.enum(DIGRESSION_LEVELS),
    speechRate: z.enum(SPEECH_RATES),
    repetition: z.enum(REPETITION_LEVELS),
    tone: z.enum(NARRATION_TONES),
    requireOutlineApproval: z.boolean(),
  })
  .strict();
export type EpisodeSettings = z.infer<typeof episodeSettingsSchema>;

/**
 * Valeurs de départ neutres, identiques aux valeurs par défaut SQL.
 * Elles ne prétendent PAS être adaptées à un profil neuroatypique : l'utilisateur
 * les modifie avant chaque génération et peut enregistrer ses propres profils d'écoute.
 */
export const NEUTRAL_DEFAULT_SETTINGS: EpisodeSettings = {
  durationMinutes: 15,
  depth: "intermediate",
  density: "medium",
  structure: "progressive",
  digressions: "moderate",
  speechRate: "moderate",
  repetition: "regular",
  tone: "warm",
  requireOutlineApproval: true,
};

/** Fusionne des préférences partielles (profil d'écoute, choix ponctuels) sur une base. */
export function resolveSettings(
  base: EpisodeSettings,
  ...overrides: ReadonlyArray<Partial<EpisodeSettings> | undefined>
): EpisodeSettings {
  const merged = Object.assign({}, base, ...overrides.filter(Boolean));
  return episodeSettingsSchema.parse(merged);
}

export const newEpisodeRequestSchema = z
  .object({
    topicPrompt: z.string().trim().min(3).max(2000),
    title: z.string().trim().max(200).optional(),
    outputLocale: localeTag,
    researchLocales: z.array(localeTag).min(1).max(5),
    settings: episodeSettingsSchema,
  })
  .strict();
export type NewEpisodeRequest = z.infer<typeof newEpisodeRequestSchema>;
