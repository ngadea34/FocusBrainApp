/**
 * Énumérations partagées. Elles DOIVENT rester identiques aux types PostgreSQL
 * (supabase/migrations) : un test compare les deux à chaque exécution.
 */
export const EPISODE_STATUSES = [
  "draft",
  "queued",
  "researching",
  "outlining",
  "awaiting_approval",
  "writing",
  "verifying",
  "synthesizing",
  "assembling",
  "ready",
  "failed",
  "cancelled",
] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export const DURATIONS_MINUTES = [5, 15, 30, 45, 60] as const;
export type DurationMinutes = (typeof DURATIONS_MINUTES)[number];

export const DEPTH_LEVELS = ["synthetic", "intermediate", "deep", "expert"] as const;
export const DENSITY_LEVELS = ["low", "medium", "high"] as const;
export const STRUCTURE_KINDS = ["linear", "progressive", "tree"] as const;
export const DIGRESSION_LEVELS = ["minimal", "moderate", "developed"] as const;
export const SPEECH_RATES = ["slow", "moderate", "fast"] as const;
export const REPETITION_LEVELS = ["low", "regular", "frequent"] as const;
export const NARRATION_TONES = ["neutral", "warm", "documentary"] as const;

export type DepthLevel = (typeof DEPTH_LEVELS)[number];
export type DensityLevel = (typeof DENSITY_LEVELS)[number];
export type StructureKind = (typeof STRUCTURE_KINDS)[number];
export type DigressionLevel = (typeof DIGRESSION_LEVELS)[number];
export type SpeechRate = (typeof SPEECH_RATES)[number];
export type RepetitionLevel = (typeof REPETITION_LEVELS)[number];
export type NarrationTone = (typeof NARRATION_TONES)[number];

export const SOURCE_KINDS = [
  "scientific_article",
  "systematic_review",
  "public_institution",
  "university",
  "reference_book",
  "popular_science",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const CLAIM_STATUSES = ["confirmed", "nuanced", "unverified", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const EVIDENCE_SUPPORTS = ["supports", "qualifies", "contradicts"] as const;
export const AUDIO_KINDS = ["segment", "full", "chapter_map", "transcript"] as const;
export const ASSET_STATUSES = ["pending", "ready", "failed"] as const;

export const STEP_TYPES = [
  "intent",
  "research",
  "evaluate_sources",
  "outline",
  "write",
  "verify",
  "synthesize_segment",
  "assemble",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const STEP_STATUSES = ["pending", "running", "succeeded", "failed", "dead", "cancelled"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const COST_CATEGORIES = [
  "research",
  "llm",
  "verification",
  "tts",
  "storage",
  "egress",
  "infra",
  "license",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "grace", "expired", "cancelled"] as const;
export const BILLING_PROVIDERS = ["none", "app_store", "play_store", "web", "revenuecat", "manual"] as const;
