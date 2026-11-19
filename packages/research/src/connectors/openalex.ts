import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/**
 * OpenAlex — découverte et relations bibliographiques. Depuis 2026, une clé gratuite est
 * nécessaire (sans clé, budget quotidien partagé par adresse IP, épuisé lors du test du
 * 19/11/2026). Désactivé par défaut ; la clé passe par un secret réseau (Authorization: Bearer).
 * Le nombre de citations n'est PAS utilisé pour juger la qualité.
 */
export class OpenAlexConnector implements Connector {
  readonly id = "openalex";
  readonly locales = "any" as const;
  constructor(private readonly http: Http, private readonly base = "https://api.openalex.org") {}

  async search(query: string, _locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const p = new URLSearchParams({ search: query, per_page: String(opts.limit ?? 5) });
    const body = await this.http.json<{ results?: Work[] }>(`${this.base}/works?${p}`, opts.signal ? { signal: opts.signal } : {});
    return (body.results ?? []).map(toDocument);
  }
}

interface Work {
  id: string; doi?: string | null; title?: string | null; display_name?: string; publication_date?: string; language?: string | null;
  type?: string; is_retracted?: boolean; ids?: { pmid?: string; pmcid?: string };
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { landing_page_url?: string | null; license?: string | null; version?: string | null; source?: { display_name?: string; type?: string } | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** Reconstruit le résumé depuis l'index inversé d'OpenAlex. */
export function invertedToText(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(" ") || null;
}

export function toDocument(w: Work): ResearchDocument {
  const preprint = w.type === "preprint" || w.primary_location?.version === "submittedVersion";
  return makeDocument({
    provider: "openalex",
    title: w.title ?? w.display_name ?? "(sans titre)",
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
    publicationDate: w.publication_date ?? null,
    url: w.primary_location?.landing_page_url ?? w.id,
    ids: {
      ...(w.doi ? { doi: w.doi } : {}),
      ...(w.ids?.pmid ? { pmid: w.ids.pmid.replace(/\D/g, "") } : {}),
      ...(w.ids?.pmcid ? { pmcid: w.ids.pmcid.split("/").pop()! } : {}),
    },
    abstract: invertedToText(w.abstract_inverted_index),
    declaredTypes: [w.type ?? "unknown"],
    language: w.language ?? null,
    license: w.primary_location?.license ?? null,
    peerReview: preprint ? "not_peer_reviewed" : "unknown",
    publicationStatus: w.is_retracted ? "retracted" : preprint ? "preprint" : "published",
    container: w.primary_location?.source?.display_name ?? null,
  });
}
