import { describe, expect, it } from "vitest";
import {
  classifyEvidence, CrossrefConnector, dedupe, EuropePmcConnector, generationContent, HalConnector, Http, HttpError,
  makeDocument, MemoryCache, normalizeLicense, OpenAlexConnector, PubMedConnector, ResearchService, WikidataConnector, WikipediaConnector,
  type Connector, type ResearchDocument,
} from "../src/index.js";
import { fixtureHttp } from "./fixtures.js";

const MANDATORY: (keyof ResearchDocument)[] = [
  "sourceProvider", "title", "authors", "publicationDate", "retrievalDate", "url", "ids", "abstract", "documentType",
  "language", "license", "peerReviewStatus", "publicationStatus", "reliabilityTier", "citation",
];

describe("licences (brief §5)", () => {
  it.each([
    ["cc by", "cc-by", true],
    ["https://creativecommons.org/licenses/by-sa/4.0/", "cc-by-sa", true],
    ["http://creativecommons.org/licenses/by-nc-nd/4.0/", "cc-by-nc-nd", false],
    ["cc by-nc", "cc-by-nc", false],
    ["cc by-nd", "cc-by-nd", false],
    ["https://creativecommons.org/publicdomain/zero/1.0/", "cc0", true],
    ["https://www.elsevier.com/tdm/userlicense/1.0/", "restricted", false],
    ["https://about.hal.science/hal-authorisation-v1/", "restricted", false],
    [null, "unknown", false],
  ])("%s → %s (génération autorisée : %s)", (raw, code, allowed) => {
    const l = normalizeLicense(raw);
    expect(l.code).toBe(code);
    expect(l.allowedForGeneration).toBe(allowed);
  });

  it("ne transmet au modèle que le contenu sous licence compatible", () => {
    const open = makeDocument({ provider: "europepmc", title: "A", abstract: "Résumé ouvert", declaredTypes: ["Journal Article"], license: "cc by" });
    const closed = makeDocument({ provider: "pubmed", title: "B", abstract: "Résumé d'éditeur", declaredTypes: ["Journal Article"], license: null });
    expect(generationContent(open)).toBe("Résumé ouvert");
    expect(generationContent(closed)).toBeNull();
    expect(closed.abstract).toBe("Résumé d'éditeur"); // conservé pour la traçabilité
  });
});

describe("évaluation documentaire (brief §4)", () => {
  const level = (types: string[], peer: "peer_reviewed" | "unknown" = "unknown", status: "published" | "preprint" = "published", provider = "pubmed") =>
    classifyEvidence({ declaredTypes: types, peerReview: peer, publicationStatus: status, provider });
  it("distingue les types de preuves", () => {
    expect(level(["Practice Guideline"])).toBe("institutional_guideline");
    expect(level(["Systematic Review", "Journal Article"])).toBe("systematic_review");
    expect(level(["Meta-Analysis"])).toBe("systematic_review");
    expect(level(["Journal Article"], "peer_reviewed")).toBe("peer_reviewed_study");
    expect(level(["Journal Article"])).toBe("primary_study");
    expect(level(["posted-content"], "unknown", "preprint", "crossref")).toBe("preprint");
    expect(level(["thèse"], "unknown", "published", "hal")).toBe("educational");
    expect(level(["encyclopedia article"], "unknown", "published", "wikipedia")).toBe("encyclopedic");
  });
  it("n'utilise jamais la popularité : deux documents identiques sauf les citations ont le même rang", () => {
    const a = makeDocument({ provider: "crossref", title: "X", declaredTypes: ["journal-article"], raw: { citations: 5000 } });
    const b = makeDocument({ provider: "crossref", title: "Y", declaredTypes: ["journal-article"], raw: { citations: 0 } });
    expect(a.reliabilityTier).toBe(b.reliabilityTier);
  });
});

describe("connecteurs (réponses réelles enregistrées le 19/11/2026)", () => {
  it("Europe PMC : métadonnées complètes, licence, PMID et DOI", async () => {
    const { http } = fixtureHttp();
    const docs = await new EuropePmcConnector(http).search("sleep deprivation memory", "en-GB");
    expect(docs.length).toBe(3);
    for (const d of docs) for (const k of MANDATORY) expect(d).toHaveProperty(k);
    expect(docs[0]!.ids.pmid).toBeTruthy();
    expect(docs.some((d) => d.license.code === "cc-by-nc-nd" && !d.license.allowedForGeneration)).toBe(true);
    expect(docs[0]!.peerReviewStatus).toBe("peer_reviewed");
  });

  it("PubMed : enchaîne recherche, résumés et métadonnées, sans licence ouverte supposée", async () => {
    const { http, urls } = fixtureHttp();
    const docs = await new PubMedConnector(http).search("sleep deprivation memory", "en-GB");
    expect(urls.map((u) => new URL(u).pathname.split("/").pop())).toEqual(["esearch.fcgi", "esummary.fcgi", "efetch.fcgi"]);
    expect(docs.length).toBe(2);
    expect(docs[0]!.abstract?.length).toBeGreaterThan(50);
    expect(docs[0]!.ids.doi).toMatch(/^10\./);
    expect(docs.every((d) => d.license.code === "unknown" && generationContent(d) === null)).toBe(true);
  });

  it("Crossref : licence de la version publiée, les licences TDM ne valent pas réutilisation", async () => {
    const { http } = fixtureHttp();
    const docs = await new CrossrefConnector(http).search("sleep deprivation memory", "en-GB");
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.ids.doi)).toBe(true);
    expect(docs.find((d) => d.license.raw?.includes("elsevier"))?.license.allowedForGeneration).toBe(false);
  });

  it("HAL : documents francophones, thèses classées comme pédagogiques", async () => {
    const { http } = fixtureHttp();
    const docs = await new HalConnector(http).search("privation de sommeil mémoire", "fr-FR");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.language).toBe("fr");
    const these = docs.find((d) => d.publicationStatus === "thesis");
    expect(these?.evidenceLevel).toBe("educational");
    expect(these?.license.code).toBe("restricted");
  });

  it("Wikipédia et Wikidata : encyclopédiques, licences CC BY-SA et CC0", async () => {
    const { http, urls } = fixtureHttp();
    const wp = await new WikipediaConnector(http).search("privation de sommeil", "fr-FR");
    expect(new URL(urls[0]!).host).toBe("fr.wikipedia.org");
    expect(wp[0]).toMatchObject({ evidenceLevel: "encyclopedic", reliabilityTier: 6, language: "fr" });
    expect(wp[0]!.license).toMatchObject({ code: "cc-by-sa", allowedForGeneration: true });
    const wd = await new WikidataConnector(http).search("privation de sommeil", "fr-FR");
    expect(wd[0]!.ids.wikidata).toBe("Q1364801");
    expect(wd[0]!.license.code).toBe("cc0");
  });

  it("OpenAlex : reconstruit le résumé et ignore le nombre de citations", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ results: [{
      id: "https://openalex.org/W1", doi: "https://doi.org/10.1000/ABC", title: "T", type: "article", publication_date: "2024-01-02", language: "en",
      cited_by_count: 99999, abstract_inverted_index: { Sleep: [0], matters: [1] }, primary_location: { license: "cc-by", landing_page_url: "https://x.org" },
    }] }))) as unknown as typeof fetch;
    const [d] = await new OpenAlexConnector(new Http({ fetchImpl })).search("sleep", "en-GB");
    expect(d).toMatchObject({ abstract: "Sleep matters", ids: { doi: "10.1000/abc" } });
    expect(d!.license.allowedForGeneration).toBe(true);
  });
});

describe("déduplication et traçabilité", () => {
  it("fusionne un même article vu par plusieurs sources, sans perdre les identifiants ni l'origine", () => {
    const epmc = makeDocument({ provider: "europepmc", title: "Sleep and memory", ids: { doi: "10.1000/AbC", pmid: "1" }, declaredTypes: ["Journal Article"], peerReview: "peer_reviewed", license: "cc by", abstract: "court" });
    const pubmed = makeDocument({ provider: "pubmed", title: "Sleep and memory.", ids: { pmid: "1", pmcid: "PMC9" }, declaredTypes: ["Journal Article"], peerReview: "peer_reviewed", abstract: "un résumé plus long" });
    const crossref = makeDocument({ provider: "crossref", title: "Sleep and Memory", ids: { doi: "https://doi.org/10.1000/abc" }, declaredTypes: ["journal-article"], license: "https://www.elsevier.com/tdm/userlicense/1.0/" });
    const other = makeDocument({ provider: "hal", title: "Autre", declaredTypes: ["ART"] });
    const out = dedupe([crossref, pubmed, epmc, other]);
    expect(out).toHaveLength(2);
    const m = out.find((d) => d.ids.doi === "10.1000/abc")!;
    expect(m.providers.sort()).toEqual(["crossref", "europepmc", "pubmed"]);
    expect(m.ids).toMatchObject({ doi: "10.1000/abc", pmid: "1", pmcid: "PMC9" });
    expect(m.abstract).toBe("un résumé plus long");
    expect(m.license.code).toBe("cc-by"); // licence ouverte déclarée par Europe PMC conservée
  });

  it("une rétractation signalée par une seule source l'emporte", () => {
    const a = makeDocument({ provider: "europepmc", title: "Z", ids: { doi: "10.2000/z" }, declaredTypes: ["Journal Article"] });
    const b = makeDocument({ provider: "crossref", title: "Z", ids: { doi: "10.2000/z" }, declaredTypes: ["journal-article"], publicationStatus: "retracted" });
    expect(dedupe([a, b])[0]!.publicationStatus).toBe("retracted");
  });

  it("fusionne par titre et année quand aucun identifiant n'est commun", () => {
    const a = makeDocument({ provider: "hal", title: "Le Sommeil, la mémoire", publicationDate: "2020-01-01", declaredTypes: ["ART"] });
    const b = makeDocument({ provider: "openalex", title: "Le sommeil la memoire", publicationDate: "2020", declaredTypes: ["article"] });
    expect(dedupe([a, b])).toHaveLength(1);
  });
});

describe("HTTP : cache, limites, reprises", () => {
  it("met en cache et n'appelle pas deux fois la même URL", async () => {
    let n = 0;
    const http = new Http({ cache: new MemoryCache(), fetchImpl: (async () => { n++; return new Response("{}"); }) as unknown as typeof fetch });
    await http.json("https://a.test/x");
    await http.json("https://a.test/x");
    expect(n).toBe(1);
  });

  it("réessaie sur 429 en respectant Retry-After, abandonne au-delà du plafond", async () => {
    const waits: number[] = [];
    let n = 0;
    const flaky = (async () => (++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : new Response('{"ok":1}'))) as unknown as typeof fetch;
    const http = new Http({ fetchImpl: flaky, sleep: async (ms) => { waits.push(ms); } });
    expect(await http.json("https://b.test/")).toEqual({ ok: 1 });
    expect(waits).toEqual([2000]);
    const blocked = new Http({ fetchImpl: (async () => new Response("", { status: 429, headers: { "retry-after": "13536" } })) as unknown as typeof fetch, sleep: async () => {} });
    await expect(blocked.json("https://c.test/")).rejects.toBeInstanceOf(HttpError);
  });

  it("n'insiste pas sur une erreur définitive (404)", async () => {
    let n = 0;
    const http = new Http({ fetchImpl: (async () => { n++; return new Response("", { status: 404 }); }) as unknown as typeof fetch, sleep: async () => {} });
    await expect(http.json("https://d.test/")).rejects.toMatchObject({ status: 404 });
    expect(n).toBe(1);
  });

  it("espace les appels vers un même hôte", async () => {
    const waits: number[] = [];
    const http = new Http({ minIntervalMs: { "api.crossref.org": 1000 }, sleep: async (ms) => { waits.push(ms); }, fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch });
    await Promise.all([http.json("https://api.crossref.org/1", { cacheTtlSeconds: 0 }), http.json("https://api.crossref.org/2", { cacheTtlSeconds: 0 })]);
    expect(waits).toEqual([1000, 1000]);
  });
});

describe("service de recherche", () => {
  const conn = (id: string, docs: ResearchDocument[] | Error): Connector => ({
    id, locales: "any", async search() { if (docs instanceof Error) throw docs; return docs; },
  });
  it("isole une source en panne, respecte la désactivation, classe par fiabilité et écarte les rétractations", async () => {
    const guideline = makeDocument({ provider: "europepmc", title: "Reco", declaredTypes: ["Practice Guideline"], ids: { pmid: "7" } });
    const wiki = makeDocument({ provider: "wikipedia", title: "Article", url: "https://fr.wikipedia.org/wiki/A", declaredTypes: ["encyclopedia article"] });
    const retracted = makeDocument({ provider: "crossref", title: "Retiré", ids: { doi: "10.9000/r" }, declaredTypes: ["journal-article"], publicationStatus: "retracted" });
    const service = new ResearchService(
      [conn("wikipedia", [wiki]), conn("europepmc", [guideline, retracted]), conn("hal", new Error("hal_503")), conn("openalex", [wiki])],
      { disabled: ["openalex"] });
    const r = await service.search([{ query: "q", locale: "fr-FR" }]);
    expect(r.documents.map((d) => d.title)).toEqual(["Reco", "Article"]);
    expect(r.connectors["hal"]).toMatchObject({ ok: false, count: 0, error: "hal_503" });
    expect(r.connectors["openalex"]).toBeUndefined();
  });
});
