import type { CostCategory } from "@app/contracts";

/**
 * Abstractions de fournisseurs (dossier §5 : modèles IA et voix interchangeables).
 * Chaque appel renvoie son usage mesuré pour alimenter cost_events.
 */
export interface UsageRecord {
  category: CostCategory;
  provider: string;
  model?: string;
  units: number;
  unit: string;
  amountMicros: number;
}

export interface LlmRequest {
  system: string;
  /** Contenu non fiable (sujet utilisateur, extraits de sources) : toujours délimité. */
  untrusted: ReadonlyArray<{ label: string; content: string }>;
  instruction: string;
  maxOutputTokens: number;
  /** Schéma JSON attendu en sortie, si structuré. */
  jsonSchema?: Record<string, unknown>;
  purpose: "intent" | "outline" | "write" | "verify" | "evaluate_sources";
}

export interface LlmResult {
  text: string;
  usage: UsageRecord[];
}

export interface LlmProvider {
  readonly id: string;
  complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResult>;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  locale?: string;
  publishedOn?: string;
  doi?: string;
}

export interface SearchProvider {
  readonly id: string;
  search(query: string, locale: string, signal?: AbortSignal): Promise<{ hits: SearchHit[]; usage: UsageRecord[] }>;
}

export interface TtsRequest {
  text: string;
  locale: string;
  voiceId: string;
  speechRate: "slow" | "moderate" | "fast";
  /** Lexique de prononciation (termes techniques) : terme → transcription. */
  lexicon?: Readonly<Record<string, string>>;
}

export interface TtsResult {
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
  usage: UsageRecord[];
}

export interface TtsProvider {
  readonly id: string;
  /** Voix retenue pour une langue (une voix principale par langue en V1). */
  voiceFor(locale: string): string;
  synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult>;
}

/**
 * Abstraction des paiements (dossier §10). L'application ne parle qu'à cette
 * interface ; le prestataire (stores natifs, RevenueCat, …) reste à choisir.
 */
export interface Entitlement {
  planCode: string;
  status: "trialing" | "active" | "grace" | "expired" | "cancelled";
  periodStart: Date;
  periodEnd: Date;
  provider: "app_store" | "play_store" | "web" | "revenuecat" | "manual";
  providerReference: string;
}

export interface PaymentProvider {
  readonly id: string;
  /** Vérifie côté serveur un événement/reçu et renvoie le droit d'accès normalisé. */
  verifyWebhook(rawBody: string, headers: Readonly<Record<string, string>>): Promise<Entitlement | null>;
}

/** Délimite un contenu non fiable pour limiter l'injection de prompt. */
export function fenceUntrusted(label: string, content: string): string {
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "data";
  // Neutralise toute tentative de fermer la balise depuis l'intérieur.
  const body = content.replaceAll(`</${safeLabel}>`, `<\\/${safeLabel}>`);
  return `<${safeLabel}>\n${body}\n</${safeLabel}>`;
}
