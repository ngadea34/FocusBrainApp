import { formatCitation } from "./citation.js";
import { classifyEvidence, RELIABILITY_TIER } from "./evidence.js";
import { normalizeLicense } from "./license.js";
import type { DocumentIds, PeerReviewStatus, PublicationStatus, ResearchDocument } from "./types.js";

export interface DocumentInput {
  provider: string;
  title: string;
  authors?: string[];
  publicationDate?: string | null;
  url?: string | null;
  ids?: DocumentIds;
  abstract?: string | null;
  declaredTypes: string[];
  language?: string | null;
  license?: string | null;
  peerReview?: PeerReviewStatus;
  publicationStatus?: PublicationStatus;
  container?: string | null;
  now?: Date;
  raw?: Record<string, unknown>;
}

const ISO_LANG: Record<string, string> = { eng: "en", fre: "fr", fra: "fr", ger: "de", deu: "de", spa: "es", ita: "it", por: "pt" };
export function normalizeLanguage(l: string | null | undefined): string | null {
  if (!l) return null;
  const s = l.trim().toLowerCase();
  return ISO_LANG[s] ?? (/^[a-z]{2}(-[a-z0-9]{2,8})*$/i.test(s) ? s : null);
}

export function normalizeDoi(doi: string | null | undefined): string | undefined {
  if (!doi) return undefined;
  const d = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d : undefined;
}

export function stripTags(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return t || null;
}

export function makeDocument(i: DocumentInput): ResearchDocument {
  const ids: DocumentIds = { ...i.ids };
  const doi = normalizeDoi(ids.doi);
  if (doi) ids.doi = doi; else delete ids.doi;
  const peerReviewStatus = i.peerReview ?? "unknown";
  const publicationStatus = i.publicationStatus ?? "unknown";
  const evidenceLevel = classifyEvidence({ declaredTypes: i.declaredTypes, peerReview: peerReviewStatus, publicationStatus, provider: i.provider });
  const base = {
    sourceProvider: i.provider,
    providers: [i.provider],
    title: (stripTags(i.title) ?? "").slice(0, 500),
    authors: (i.authors ?? []).filter(Boolean).slice(0, 50),
    publicationDate: i.publicationDate ?? null,
    retrievalDate: (i.now ?? new Date()).toISOString(),
    url: i.url ?? (doi ? `https://doi.org/${doi}` : null),
    ids,
    abstract: stripTags(i.abstract),
    documentType: i.declaredTypes.join("; ") || "unknown",
    language: normalizeLanguage(i.language),
    license: normalizeLicense(i.license),
    peerReviewStatus,
    publicationStatus,
    evidenceLevel,
    reliabilityTier: RELIABILITY_TIER[evidenceLevel],
    ...(i.raw ? { raw: i.raw } : {}),
  };
  return { ...base, citation: formatCitation({ ...base, container: i.container ?? null }) };
}
