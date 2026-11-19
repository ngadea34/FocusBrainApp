import { primaryLanguage } from "@app/contracts";
import { makeDocument } from "../document.js";
import type { Http } from "../http.js";
import type { Connector, ResearchDocument, SearchOptions } from "../types.js";

/**
 * Wikipédia — contextualisation. Texte sous CC BY-SA 4.0 : réutilisation commerciale
 * et transformation permises, avec attribution et partage à l'identique (à respecter
 * dans les crédits de l'épisode). Source encyclopédique : rang le plus faible.
 */
export class WikipediaConnector implements Connector {
  readonly id = "wikipedia";
  readonly locales = "any" as const;
  constructor(private readonly http: Http) {}

  async search(query: string, locale: string, opts: SearchOptions = {}): Promise<ResearchDocument[]> {
    const lang = primaryLanguage(locale);
    if (!/^[a-z]{2,3}$/.test(lang)) throw new Error(`unsupported_locale:${locale}`);
    const p = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: query, gsrlimit: String(opts.limit ?? 3),
      prop: "extracts|info", exintro: "1", explaintext: "1", inprop: "url",
    });
    const body = await this.http.json<{ query?: { pages?: Page[] } }>(`https://${lang}.wikipedia.org/w/api.php?${p}`, opts.signal ? { signal: opts.signal } : {});
    return (body.query?.pages ?? [])
      .filter((x) => x.fullurl && x.extract)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((x) => makeDocument({
        provider: "wikipedia", title: x.title, url: x.fullurl!, abstract: x.extract!.slice(0, 4000), declaredTypes: ["encyclopedia article"],
        language: lang, license: "https://creativecommons.org/licenses/by-sa/4.0/", peerReview: "not_peer_reviewed", publicationStatus: "published",
        publicationDate: x.touched?.slice(0, 10) ?? null, container: `Wikipédia (${lang})`,
      }));
  }
}

interface Page { title: string; extract?: string; fullurl?: string; index?: number; touched?: string }
