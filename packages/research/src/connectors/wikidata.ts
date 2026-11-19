import { primaryLanguage } from "@app/contracts";
import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/**
 * Wikidata — concepts et relations (données sous CC0). Sert à désambiguïser un sujet et
 * à trouver ses libellés dans d'autres langues, pas à prouver une affirmation.
 */
export class WikidataConnector implements Connector {
  readonly id = "wikidata";
  readonly locales = "any" as const;
  constructor(private readonly http: Http) {}

  async search(query: string, locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const lang = primaryLanguage(locale);
    const p = new URLSearchParams({ action: "wbsearchentities", search: query, language: lang, uselang: lang, format: "json", limit: String(opts.limit ?? 3) });
    const body = await this.http.json<{ search?: Entity[] }>(`https://www.wikidata.org/w/api.php?${p}`, opts.signal ? { signal: opts.signal } : {});
    return (body.search ?? []).map((e) => makeDocument({
      provider: "wikidata", title: e.label ?? e.id, url: `https://www.wikidata.org/wiki/${e.id}`, ids: { wikidata: e.id },
      abstract: e.description ?? null, declaredTypes: ["knowledge base entity"], language: lang,
      license: "https://creativecommons.org/publicdomain/zero/1.0/", peerReview: "not_peer_reviewed", publicationStatus: "published",
      container: "Wikidata",
    }));
  }
}

interface Entity { id: string; label?: string; description?: string }
