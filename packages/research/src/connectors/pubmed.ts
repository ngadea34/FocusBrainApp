import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/**
 * PubMed via NCBI E-utilities (esearch + esummary + efetch pour les résumés).
 * Sans clé : 3 requêtes/s (en-tête X-RateLimit-Limit observé le 19/11/2026).
 * PubMed ne fournit pas de licence : les résumés sont donc « restricted » par défaut.
 */
export class PubMedConnector implements Connector {
  readonly id = "pubmed";
  readonly locales = "any" as const;
  constructor(private readonly http: Http, private readonly base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils") {}

  async search(query: string, _locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const sig = opts.signal ? { signal: opts.signal } : {};
    const s = await this.http.json<{ esearchresult?: { idlist?: string[] } }>(
      `${this.base}/esearch.fcgi?${new URLSearchParams({ db: "pubmed", term: query, retmode: "json", retmax: String(opts.limit ?? 5), sort: "relevance" })}`, sig);
    const ids = s.esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    const sum = await this.http.json<{ result?: Record<string, Summary> }>(
      `${this.base}/esummary.fcgi?${new URLSearchParams({ db: "pubmed", id: ids.join(","), retmode: "json" })}`, sig);
    const xml = await this.http.text(`${this.base}/efetch.fcgi?${new URLSearchParams({ db: "pubmed", id: ids.join(","), rettype: "abstract", retmode: "xml" })}`,
      { accept: "application/xml", ...sig });
    const abstracts = parseAbstracts(xml);
    return ids.map((id) => sum.result?.[id]).filter((x): x is Summary => !!x).map((r) => toDocument(r, abstracts.get(r.uid) ?? null));
  }
}

interface Summary {
  uid: string; title?: string; pubdate?: string; sortpubdate?: string; authors?: { name: string }[];
  pubtype?: string[]; lang?: string[]; fulljournalname?: string; articleids?: { idtype: string; value: string }[];
}

export function toDocument(r: Summary, abstract: string | null): ResearchDocument {
  const id = (t: string) => r.articleids?.find((a) => a.idtype === t)?.value;
  const types = r.pubtype ?? [];
  const retracted = types.some((t) => /retracted publication/i.test(t));
  return makeDocument({
    provider: "pubmed",
    title: r.title ?? "(sans titre)",
    authors: r.authors?.map((a) => a.name) ?? [],
    publicationDate: r.sortpubdate ? r.sortpubdate.slice(0, 10).replaceAll("/", "-") : r.pubdate ?? null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`,
    ids: { pmid: r.uid, ...(id("doi") ? { doi: id("doi")! } : {}), ...(id("pmc") ? { pmcid: id("pmc")! } : {}) },
    abstract,
    declaredTypes: types,
    language: r.lang?.[0] ?? null,
    license: null,
    peerReview: types.some((t) => /preprint/i.test(t)) ? "not_peer_reviewed" : types.some((t) => /journal article/i.test(t)) ? "peer_reviewed" : "unknown",
    publicationStatus: retracted ? "retracted" : types.some((t) => /preprint/i.test(t)) ? "preprint" : "published",
    container: r.fulljournalname ?? null,
  });
}

/** Extrait les résumés du XML efetch, sans dépendance (structure PubmedArticle stable). */
export function parseAbstracts(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const art of xml.split("<PubmedArticle>").slice(1)) {
    const pmid = /<PMID[^>]*>(\d+)<\/PMID>/.exec(art)?.[1];
    const abs = /<Abstract>([\s\S]*?)<\/Abstract>/.exec(art)?.[1];
    if (pmid && abs) {
      const text = [...abs.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
        .map((m) => { const label = /Label="([^"]+)"/.exec(m[1]!)?.[1]; return `${label ? `${label}: ` : ""}${m[2]!.replace(/<[^>]+>/g, "")}`; })
        .join(" ");
      if (text) out.set(pmid, decode(text));
    }
  }
  return out;
}
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
