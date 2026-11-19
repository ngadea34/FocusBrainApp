import { classifyEvidence, RELIABILITY_TIER } from "./evidence.js";
import { formatCitation } from "./citation.js";
import type { ResearchDocument } from "./types.js";

/** Clé d'identité : DOI > PMID > PMCID > HAL > Wikidata > URL normalisée > titre normalisé. */
export function identityKeys(d: ResearchDocument): string[] {
  const keys: string[] = [];
  if (d.ids.doi) keys.push(`doi:${d.ids.doi}`);
  if (d.ids.pmid) keys.push(`pmid:${d.ids.pmid}`);
  if (d.ids.pmcid) keys.push(`pmcid:${d.ids.pmcid.toUpperCase()}`);
  if (d.ids.halId) keys.push(`hal:${d.ids.halId}`);
  if (d.ids.wikidata) keys.push(`wikidata:${d.ids.wikidata}`);
  if (d.url) keys.push(`url:${normalizeUrl(d.url)}`);
  keys.push(`title:${normalizeTitle(d.title)}|${d.publicationDate?.slice(0, 4) ?? ""}`);
  return keys;
}

export function canonicalKey(d: ResearchDocument): string {
  return identityKeys(d)[0]!;
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.protocol = "https:";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

export function normalizeTitle(t: string): string {
  return t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const PRIORITY: Record<string, number> = { europepmc: 1, pubmed: 2, hal: 3, openalex: 4, crossref: 5, wikipedia: 6, wikidata: 7 };

/**
 * Fusionne les doublons venant de plusieurs connecteurs. On garde, pour chaque champ, la
 * valeur la plus informative ; pour la licence, la plus permissive EXPLICITEMENT déclarée
 * (une source qui ne dit rien ne retire pas une licence ouverte déclarée ailleurs) ; pour la
 * rétractation, la plus défavorable.
 */
export function dedupe(docs: readonly ResearchDocument[]): ResearchDocument[] {
  const groups: ResearchDocument[][] = [];
  const index = new Map<string, number>();
  for (const d of docs) {
    const keys = identityKeys(d);
    const found = keys.map((k) => index.get(k)).find((g) => g !== undefined);
    const g = found ?? groups.push([]) - 1;
    groups[g]!.push(d);
    for (const k of keys) if (!index.has(k)) index.set(k, g);
  }
  return groups.map(merge);
}

function merge(group: ResearchDocument[]): ResearchDocument {
  if (group.length === 1) return group[0]!;
  const sorted = [...group].sort((a, b) => (PRIORITY[a.sourceProvider] ?? 9) - (PRIORITY[b.sourceProvider] ?? 9));
  const best = sorted[0]!;
  const pick = <K extends keyof ResearchDocument>(k: K) => sorted.map((d) => d[k]).find((v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) ?? best[k];
  const ids = Object.assign({}, ...[...sorted].reverse().map((d) => d.ids)) as ResearchDocument["ids"];
  const licenses = sorted.map((d) => d.license).filter((l) => l.code !== "unknown");
  const license = licenses.find((l) => l.allowedForGeneration) ?? licenses[0] ?? best.license;
  const retracted = sorted.some((d) => d.publicationStatus === "retracted");
  const peer = sorted.find((d) => d.peerReviewStatus !== "unknown")?.peerReviewStatus ?? "unknown";
  const publicationStatus = retracted ? "retracted" : (pick("publicationStatus") as ResearchDocument["publicationStatus"]);
  const types = [...new Set(sorted.flatMap((d) => d.documentType.split("; ")).filter((t) => t && t !== "unknown"))];
  const evidenceLevel = classifyEvidence({ declaredTypes: types, peerReview: peer, publicationStatus, provider: best.sourceProvider });
  const merged: ResearchDocument = {
    ...best,
    providers: [...new Set(sorted.flatMap((d) => d.providers))],
    title: pick("title") as string,
    authors: pick("authors") as string[],
    publicationDate: pick("publicationDate") as string | null,
    url: pick("url") as string | null,
    ids,
    abstract: [...sorted].map((d) => d.abstract).sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? null,
    documentType: types.join("; ") || "unknown",
    language: pick("language") as string | null,
    license,
    peerReviewStatus: peer,
    publicationStatus,
    evidenceLevel,
    reliabilityTier: RELIABILITY_TIER[evidenceLevel],
  };
  return { ...merged, citation: formatCitation(merged) };
}
