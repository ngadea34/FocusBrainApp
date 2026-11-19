import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/** HAL (CCSD) — publications et thèses francophones, API Solr publique sans clé. */
export class HalConnector implements Connector {
  readonly id = "hal";
  readonly locales = "any" as const;
  constructor(private readonly http: Http, private readonly base = "https://api.archives-ouvertes.fr/search/") {}

  async search(query: string, _locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const p = new URLSearchParams({ q: query, rows: String(opts.limit ?? 5), wt: "json", fl: FIELDS });
    const body = await this.http.json<{ response?: { docs?: HalDoc[] } }>(`${this.base}?${p}`, opts.signal ? { signal: opts.signal } : {});
    return (body.response?.docs ?? []).map(toDocument);
  }
}

const FIELDS = "docid,halId_s,title_s,authFullName_s,producedDate_s,doiId_s,uri_s,docType_s,language_s,licence_s,abstract_s,peerReviewing_s,journalTitle_s";

interface HalDoc {
  docid: string; halId_s?: string; title_s?: string[]; authFullName_s?: string[]; producedDate_s?: string; doiId_s?: string;
  uri_s?: string; docType_s?: string; language_s?: string[]; licence_s?: string; abstract_s?: string[]; peerReviewing_s?: string; journalTitle_s?: string;
}

const HAL_TYPES: Record<string, string> = {
  ART: "journal article", COMM: "conference paper", THESE: "thèse", HDR: "thèse", MEM: "mémoire", OUV: "book", COUV: "book-chapter",
  REPORT: "report", UNDEFINED: "preprint", PREPRINT: "preprint", LECTURE: "cours", POSTER: "poster",
};

export function toDocument(d: HalDoc): ResearchDocument {
  const type = d.docType_s ?? "UNDEFINED";
  const preprint = type === "UNDEFINED" || type === "PREPRINT";
  const thesis = type === "THESE" || type === "HDR";
  return makeDocument({
    provider: "hal",
    title: d.title_s?.[0] ?? "(sans titre)",
    authors: d.authFullName_s ?? [],
    publicationDate: d.producedDate_s ?? null,
    url: d.uri_s ?? null,
    ids: { halId: d.halId_s ?? d.docid, ...(d.doiId_s ? { doi: d.doiId_s } : {}) },
    abstract: d.abstract_s?.[0] ?? null,
    declaredTypes: [HAL_TYPES[type] ?? type],
    language: d.language_s?.[0] ?? null,
    license: d.licence_s ?? null,
    peerReview: d.peerReviewing_s === "1" ? "peer_reviewed" : d.peerReviewing_s === "0" || preprint ? "not_peer_reviewed" : "unknown",
    publicationStatus: preprint ? "preprint" : thesis ? "thesis" : "published",
    container: d.journalTitle_s ?? null,
  });
}
