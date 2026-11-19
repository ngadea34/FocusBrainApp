import { primaryLanguage } from "@app/contracts";
import type { SearchHit, SearchProvider } from "@app/pipeline";

/**
 * Recherche dans Wikipédia (API publique, gratuite, sans clé) — source de départ en dev.
 * Wikipédia est une source tertiaire : classée « other » (rang 6) avec une limite explicite.
 * Chaque résultat inclut l'introduction de l'article en texte brut (snippet), qui sert
 * ensuite de base aux vérifications : une citation n'est conservée que si elle y figure.
 */
export interface WikipediaOptions {
  fetchImpl?: typeof fetch;
  limit?: number;
  /** Longueur maximale de l'extrait conservé par article. */
  maxExtractChars?: number;
}

const USER_AGENT = "podcast-app-dev/0.1 (worker; contact via repository)";

export class WikipediaSearch implements SearchProvider {
  readonly id = "wikipedia";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: WikipediaOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async search(query: string, locale: string, signal?: AbortSignal) {
    const lang = primaryLanguage(locale);
    if (!/^[a-z]{2,3}$/.test(lang)) throw new Error(`unsupported_locale:${locale}`);
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", origin: "*",
      generator: "search", gsrsearch: query, gsrlimit: String(this.opts.limit ?? 4),
      prop: "extracts|info", exintro: "1", explaintext: "1", inprop: "url",
    });
    const res = await this.fetchImpl(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const err = new Error(`wikipedia_${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    const body = (await res.json()) as {
      query?: { pages?: { title: string; extract?: string; fullurl?: string; index?: number; touched?: string }[] };
    };
    const max = this.opts.maxExtractChars ?? 4000;
    const hits: SearchHit[] = (body.query?.pages ?? [])
      .filter((p) => p.fullurl && p.extract)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((p) => ({
        title: p.title,
        url: p.fullurl!,
        snippet: p.extract!.slice(0, max),
        locale,
        ...(p.touched ? { publishedOn: p.touched.slice(0, 10) } : {}),
      }));
    return { hits, usage: [{ category: "research" as const, provider: this.id, units: 1, unit: "queries", amountMicros: 0 }] };
  }
}
