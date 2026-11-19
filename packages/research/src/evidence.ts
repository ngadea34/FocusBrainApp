import type { EvidenceLevel, PeerReviewStatus, PublicationStatus } from "./types.js";

/**
 * Classe un document selon le type de preuve (brief §4), à partir des types déclarés
 * par la source. Le nombre de citations et la popularité ne sont JAMAIS utilisés.
 */
export function classifyEvidence(input: {
  declaredTypes: readonly string[];
  peerReview: PeerReviewStatus;
  publicationStatus: PublicationStatus;
  provider: string;
}): EvidenceLevel {
  const t = input.declaredTypes.map((x) => x.toLowerCase());
  const has = (...words: string[]) => t.some((x) => words.some((w) => x.includes(w)));
  if (input.publicationStatus === "retracted" || has("retracted publication", "retraction")) return "unknown";
  if (input.provider === "wikipedia" || input.provider === "wikidata") return "encyclopedic";
  if (has("practice guideline", "guideline", "consensus development", "recommandation")) return "institutional_guideline";
  if (has("systematic review", "meta-analysis", "méta-analyse", "revue systématique")) return "systematic_review";
  if (input.publicationStatus === "preprint" || has("preprint", "posted-content")) return "preprint";
  if (has("editorial", "comment", "letter", "news", "lecture", "these", "thèse", "mem", "mémoire", "course", "cours", "book-chapter", "book", "ouv", "couv")) {
    return "educational";
  }
  if (has("clinical trial", "randomized controlled trial", "observational study", "comparative study", "journal article", "research-article", "journal-article", "art")) {
    return input.peerReview === "peer_reviewed" ? "peer_reviewed_study" : "primary_study";
  }
  return "unknown";
}

/** Rang de fiabilité 1 (meilleur) à 6, aligné sur SOURCE_TIER de @app/contracts. */
export const RELIABILITY_TIER: Record<EvidenceLevel, number> = {
  institutional_guideline: 1,
  systematic_review: 2,
  peer_reviewed_study: 3,
  primary_study: 4,
  preprint: 5,
  educational: 5,
  encyclopedic: 6,
  unknown: 6,
};
