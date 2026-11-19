import type { EpisodeSettings, SpeechRate } from "@app/contracts";

/**
 * Estimation du coût variable d'un épisode, AVANT génération.
 * Sert à l'étude de coûts (prix, quotas) et au plafond par épisode.
 * Toutes les hypothèses sont explicites et à recalibrer avec les mesures réelles.
 */
export interface PriceSheet {
  /** USD par million de tokens */
  llmInputPerMTok: number;
  llmOutputPerMTok: number;
  /** USD par million de caractères synthétisés */
  ttsPerMChars: number;
  /** USD par requête de recherche */
  searchPerQuery: number;
  /** USD par Go-mois de stockage, Go de sortie */
  storagePerGbMonth: number;
  egressPerGb: number;
}

export interface CostAssumptions {
  wordsPerMinute: Record<SpeechRate, number>;
  charsPerWord: number;
  tokensPerWord: number;
  /** Tokens d'entrée (sources, plan, consignes) par token de script produit, toutes étapes LLM. */
  inputToOutputRatio: number;
  /** Multiplicateur de tokens de sortie hors script (intention, plan, vérification). */
  outputOverhead: number;
  searchQueries: number;
  /** Débit audio en kbit/s (MP3 mono parole). */
  audioKbps: number;
  /** Écoutes complètes moyennes par épisode (pour la sortie réseau). */
  playsPerEpisode: number;
  retentionMonths: number;
}

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  wordsPerMinute: { slow: 130, moderate: 150, fast: 170 },
  charsPerWord: 6,
  tokensPerWord: 1.6,
  inputToOutputRatio: 6,
  outputOverhead: 0.6,
  searchQueries: 12,
  audioKbps: 64,
  playsPerEpisode: 1.5,
  retentionMonths: 12,
};

export interface CostBreakdown {
  words: number;
  characters: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  usd: { llm: number; tts: number; research: number; storage: number; egress: number; total: number };
}

export function estimateEpisodeCost(
  settings: Pick<EpisodeSettings, "durationMinutes" | "speechRate">,
  prices: PriceSheet,
  a: CostAssumptions = DEFAULT_ASSUMPTIONS,
): CostBreakdown {
  const words = settings.durationMinutes * a.wordsPerMinute[settings.speechRate];
  const characters = words * a.charsPerWord;
  const scriptTokens = words * a.tokensPerWord;
  const llmOutputTokens = scriptTokens * (1 + a.outputOverhead);
  const llmInputTokens = scriptTokens * a.inputToOutputRatio;
  const audioGb = (settings.durationMinutes * 60 * a.audioKbps * 1000) / 8 / 1e9;

  const llm = (llmInputTokens * prices.llmInputPerMTok + llmOutputTokens * prices.llmOutputPerMTok) / 1e6;
  const tts = (characters * prices.ttsPerMChars) / 1e6;
  const research = a.searchQueries * prices.searchPerQuery;
  const storage = audioGb * prices.storagePerGbMonth * a.retentionMonths;
  const egress = audioGb * a.playsPerEpisode * prices.egressPerGb;
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return {
    words,
    characters,
    llmInputTokens: Math.round(llmInputTokens),
    llmOutputTokens: Math.round(llmOutputTokens),
    usd: {
      llm: round(llm),
      tts: round(tts),
      research: round(research),
      storage: round(storage),
      egress: round(egress),
      total: round(llm + tts + research + storage + egress),
    },
  };
}

/** Convertit un montant USD en micro-USD (unité de cost_events). */
export function toMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}
