import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/** Europe PMC (EMBL-EBI) — REST, sans clé. Champ `license` fourni pour les articles en accès ouvert. */
export class EuropePmcConnector implements Connector {
  readonly id = "europepmc";
  readonly locales = "any" as const;
  constructor(private readonly http: Http, private readonly base = "https://www.ebi.ac.uk/europepmc/webservices/rest") {}

  async search(query: string, _locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const p = new URLSearchParams({ query, format: "json", resultType: "core", pageSize: String(opts.limit ?? 5) });
    const body = await this.http.json<{ resultList?: { result?: EpmcResult[] } }>(`${this.base}/search?${p}`, opts.signal ? { signal: opts.signal } : {});
    return (body.resultList?.result ?? []).map((r) => toDocument(r));
  }
}

interface EpmcResult {
  id?: string; source?: string; pmid?: string; pmcid?: string; doi?: string; title?: string;
  authorString?: string; authorList?: { author?: { fullName?: string }[] };
  firstPublicationDate?: string; pubYear?: string; abstractText?: string; language?: string; license?: string;
  isOpenAccess?: string; pubTypeList?: { pubType?: string[] }; journalInfo?: { journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
}

export function toDocument(r: EpmcResult): ResearchDocument {
  const types = r.pubTypeList?.pubType ?? [];
  const preprint = r.source === "PPR" || types.some((t) => /preprint/i.test(t));
  const retracted = types.some((t) => /retracted publication/i.test(t));
  return makeDocument({
    provider: "europepmc",
    title: r.title ?? "(sans titre)",
    authors: r.authorList?.author?.map((a) => a.fullName ?? "").filter(Boolean) ?? (r.authorString ? r.authorString.split(", ") : []),
    publicationDate: r.firstPublicationDate ?? r.pubYear ?? null,
    url: r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : r.pmid ? `https://europepmc.org/article/MED/${r.pmid}` : null,
    ids: { ...(r.doi ? { doi: r.doi } : {}), ...(r.pmid ? { pmid: r.pmid } : {}), ...(r.pmcid ? { pmcid: r.pmcid } : {}) },
    abstract: r.abstractText ?? null,
    declaredTypes: preprint ? [...types, "preprint"] : types,
    language: r.language ?? null,
    license: r.license ?? null,
    // MEDLINE indexe des revues à comité de lecture ; « Journal Article » hors prépublication = relu.
    peerReview: preprint ? "not_peer_reviewed" : r.source === "MED" && types.some((t) => /journal article|research-article/i.test(t)) ? "peer_reviewed" : "unknown",
    publicationStatus: retracted ? "retracted" : preprint ? "preprint" : "published",
    container: r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher ?? null,
  });
}
