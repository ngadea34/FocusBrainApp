/**
 * Moteur documentaire : modèle commun à tous les connecteurs (brief Research Engine V1, §3).
 * Aucun moteur métier ne dépend d'un fournisseur : ils ne voient que ResearchDocument.
 */

/** Type de preuve, du plus fort au plus faible (brief §4). Jamais déduit de la popularité. */
export const EVIDENCE_LEVELS = [
  "institutional_guideline",
  "systematic_review",
  "peer_reviewed_study",
  "primary_study",          // observationnelle / expérimentale, relecture non établie
  "preprint",
  "educational",
  "encyclopedic",
  "unknown",
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export type PeerReviewStatus = "peer_reviewed" | "not_peer_reviewed" | "unknown";
export type PublicationStatus = "published" | "preprint" | "thesis" | "retracted" | "unknown";

/** Ce que la licence permet pour un usage commercial (brief §5). */
export interface LicenseInfo {
  /** Licence telle que fournie par la source (URL ou libellé). */
  raw: string | null;
  /** Code normalisé : cc0, cc-by, cc-by-sa, cc-by-nc, cc-by-nd, cc-by-nc-nd, cc-by-nc-sa, public-domain, restricted, unknown. */
  code: string;
  commercialUse: boolean;
  derivatives: boolean;
  /** true seulement si le texte peut être transmis au moteur de génération (usage commercial ET transformation permis). */
  allowedForGeneration: boolean;
}

export interface DocumentIds {
  doi?: string;
  pmid?: string;
  pmcid?: string;
  halId?: string;
  wikidata?: string;
  arxiv?: string;
}

export interface ResearchDocument {
  sourceProvider: string;            // connecteur d'origine (fusion : plusieurs)
  providers: string[];
  title: string;
  authors: string[];
  publicationDate: string | null;    // AAAA-MM-JJ ou AAAA
  retrievalDate: string;             // ISO
  url: string | null;
  ids: DocumentIds;
  /** Résumé ou extrait. Conservé pour la traçabilité, transmis au modèle seulement si la licence le permet. */
  abstract: string | null;
  documentType: string;              // type déclaré par la source (ex. « Journal Article », « THESE »)
  language: string | null;           // BCP 47 si connu
  license: LicenseInfo;
  /** Licence propre au résumé quand elle diffère (ex. Wikipédia CC BY-SA). */
  peerReviewStatus: PeerReviewStatus;
  publicationStatus: PublicationStatus;
  evidenceLevel: EvidenceLevel;
  /** Rang 1 (le plus fiable) à 6, dérivé du type de preuve uniquement. */
  reliabilityTier: number;
  citation: string;                  // référence lisible, générée de façon déterministe
  /** Données propres au fournisseur, pour le débogage (jamais transmises au modèle). */
  raw?: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface Connector {
  readonly id: string;
  /** Langues que la source couvre bien (le service ne l'interroge pas pour les autres). */
  readonly locales: readonly string[] | "any";
  search(query: string, locale: string, opts?: SearchOptions): Promise<ResearchDocument[]>;
}
