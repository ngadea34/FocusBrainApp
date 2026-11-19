/**
 * Derniers réglages utilisés, gardés sur le téléphone (confort, pas une donnée
 * critique) : relus à la création suivante. Toute valeur inconnue est ignorée.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DENSITY_LEVELS, DEPTH_LEVELS, DIGRESSION_LEVELS, NARRATION_TONES, REPETITION_LEVELS, STRUCTURE_KINDS,
} from "@app/contracts";
import type { FineSettings } from "./api";

export const FINE_OPTIONS = {
  depth: DEPTH_LEVELS,
  density: DENSITY_LEVELS,
  structure: STRUCTURE_KINDS,
  digressions: DIGRESSION_LEVELS,
  repetition: REPETITION_LEVELS,
  tone: NARRATION_TONES,
} as const;
export type FineKey = keyof typeof FINE_OPTIONS;
export const FINE_KEYS = Object.keys(FINE_OPTIONS) as FineKey[];

/** Valeurs de départ = valeurs par défaut du serveur (NEUTRAL_DEFAULT_SETTINGS). */
export const DEFAULT_FINE: FineSettings = {
  depth: "intermediate", density: "medium", structure: "progressive", digressions: "moderate", repetition: "regular", tone: "warm",
};

export interface LastChoices { fine: FineSettings; outputLocale?: string; durationMinutes?: number; requireOutlineApproval?: boolean }

export function sanitize(raw: unknown): LastChoices {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (o["fine"] && typeof o["fine"] === "object" ? o["fine"] : {}) as Record<string, unknown>;
  const fine = { ...DEFAULT_FINE };
  for (const k of FINE_KEYS) {
    const v = f[k];
    if (typeof v === "string" && (FINE_OPTIONS[k] as readonly string[]).includes(v)) (fine as Record<string, string>)[k] = v;
  }
  return {
    fine,
    ...(o["outputLocale"] === "fr-FR" || o["outputLocale"] === "en-GB" ? { outputLocale: o["outputLocale"] } : {}),
    ...(o["durationMinutes"] === 5 || o["durationMinutes"] === 15 ? { durationMinutes: o["durationMinutes"] } : {}),
    ...(typeof o["requireOutlineApproval"] === "boolean" ? { requireOutlineApproval: o["requireOutlineApproval"] } : {}),
  };
}

const KEY = "last-episode-choices-v1";

export async function loadLastChoices(): Promise<LastChoices> {
  try { return sanitize(JSON.parse((await AsyncStorage.getItem(KEY)) ?? "null")); } catch { return sanitize(null); }
}

export async function saveLastChoices(c: LastChoices): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(c)); } catch { /* stockage indisponible : sans conséquence */ }
}
