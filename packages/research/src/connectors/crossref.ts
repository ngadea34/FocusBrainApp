import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/**
 * Crossref — métadonnées et licences par DOI. Pool public : 1 requête/s, 1 à la fois
 * (en-têtes observés le 19/11/2026). Sert surtout à VÉRIFIER un DOI et sa licence.
 */
export class CrossrefConnector implements Connector {
  readonly id = "crossref";
  readonly locales = "any" as const;
  constructor(private readonly http: Http, private readonly base = "https://api.crossref.org") {}

  async search(query: string, _locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const p = new URLSearchParams({ query, rows: String(opts.limit ?? 5), select: SELECT });
    const body = await this.http.json<{ message?: { items?: CrossrefWork[] } }>(`${this.base}/works?${p}`, opts.signal ? { signal: opts.signal } : {});
    return (body.message?.items ?? []).map(toDocument);
  }

  /** Métadonnées d'un DOI précis (vérification). null si inconnu de Crossref. */
  async byDoi(doi: string, signal?: AbortSignal): Promise<ResearchDocument | null> {
    try {
      const body = await this.http.json<{ message?: CrossrefWork }>(`${this.base}/works/${encodeURIComponent(doi)}`, signal ? { signal } : {});
      return body.message ? toDocument(body.message) : null;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }
}

const SELECT = "DOI,title,author,issued,type,license,container-title,abstract,URL,update-to";

interface CrossrefWork {
  DOI: string; title?: string[]; author?: { given?: string; family?: string; name?: string }[];
  issued?: { "date-parts"?: number[][] }; type?: string; license?: { URL: string; "content-version"?: string; start?: { "date-time"?: string } }[];
  "container-title"?: string[]; abstract?: string; URL?: string; "update-to"?: { type?: string }[];
}

/** Licence applicable à la version publiée (vor), sinon la première. Les licences TDM ne valent pas réutilisation. */
function pickLicense(ls: CrossrefWork["license"]): string | null {
  if (!ls?.length) return null;
  const usable = ls.filter((l) => l["content-version"] !== "tdm");
  return (usable.find((l) => l["content-version"] === "vor") ?? usable[0] ?? ls[0])!.URL;
}

export function toDocument(w: CrossrefWork): ResearchDocument {
  const parts = w.issued?.["date-parts"]?.[0];
  const date = parts?.length ? parts.map((n, i) => (i ? String(n).padStart(2, "0") : String(n))).join("-") : null;
  const preprint = w.type === "posted-content";
  const retracted = w["update-to"]?.some((u) => /retraction/i.test(u.type ?? "")) ?? false;
  return makeDocument({
    provider: "crossref",
    title: w.title?.[0] ?? "(sans titre)",
    authors: (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" ")),
    publicationDate: date,
    url: w.URL ?? null,
    ids: { doi: w.DOI },
    abstract: w.abstract ?? null,
    declaredTypes: [w.type ?? "unknown"],
    language: null,
    license: pickLicense(w.license),
    // Crossref n'indique pas la relecture par les pairs : on ne la suppose pas.
    peerReview: preprint ? "not_peer_reviewed" : "unknown",
    publicationStatus: retracted ? "retracted" : preprint ? "preprint" : "published",
    container: w["container-title"]?.[0] ?? null,
  });
}
