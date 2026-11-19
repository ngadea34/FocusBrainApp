/**
 * Essai en direct contre les vraies API (pas en CI : réseau et limites d'appels).
 * Lancement : pnpm test:live
 */
import { describe, expect, it } from "vitest";
import {
  CrossrefConnector, EuropePmcConnector, HalConnector, Http, MemoryCache, PubMedConnector, ResearchService, WikidataConnector, WikipediaConnector,
} from "../src/index.js";

const http = new Http({
  cache: new MemoryCache(),
  timeoutMs: 45_000,
  minIntervalMs: { "api.crossref.org": 1100, "eutils.ncbi.nlm.nih.gov": 400, "www.wikidata.org": 1000 },
});
const service = new ResearchService([
  new EuropePmcConnector(http), new PubMedConnector(http), new CrossrefConnector(http), new HalConnector(http),
  new WikipediaConnector(http), new WikidataConnector(http),
], { perConnectorLimit: 3 });

describe.each([
  ["fr-FR", "privation de sommeil mémoire"],
  ["en-GB", "sleep deprivation memory"],
])("recherche réelle %s", (locale, query) => {
  it("trouve des documents tracés et classés", async () => {
    const r = await service.search([{ query, locale }]);
    console.log(locale, JSON.stringify(r.connectors));
    expect(r.documents.length).toBeGreaterThan(3);
    for (const d of r.documents) {
      expect(d.title).toBeTruthy();
      expect(d.url ?? d.ids.doi ?? d.ids.pmid).toBeTruthy();
      expect(d.citation).toBeTruthy();
      expect(d.retrievalDate).toMatch(/^\d{4}-/);
    }
    const tiers = r.documents.map((d) => d.reliabilityTier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  }, 180_000);
});
