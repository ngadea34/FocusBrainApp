/**
 * Démonstration du moteur documentaire sur 3 sujets de complexité croissante (brief §6.8).
 * Interroge les vraies API et écrit docs/research/DEMO.md. Lancement : pnpm research:demo
 * (le modèle de génération n'intervient pas : la vérification des affirmations exige Qwen3).
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import {
  CrossrefConnector, EuropePmcConnector, HalConnector, Http, MemoryCache, OpenAlexConnector, PubMedConnector, ResearchService, WikidataConnector, WikipediaConnector,
} from "../../packages/research/src/index.js";

const TOPICS = [
  { level: "Simple", locale: "fr-FR", queries: [{ query: "couleur bleue du ciel diffusion Rayleigh", locale: "fr-FR" }, { query: "Rayleigh scattering sky colour", locale: "en-GB" }] },
  { level: "Intermédiaire", locale: "en-GB", queries: [{ query: "sleep deprivation memory consolidation", locale: "en-GB" }, { query: "privation de sommeil mémoire", locale: "fr-FR" }] },
  { level: "Complexe (débattu)", locale: "fr-FR", queries: [{ query: "screen time attention children", locale: "en-GB" }, { query: "écrans attention enfants", locale: "fr-FR" }] },
];

it("démonstration sur 3 sujets", async () => {
  const http = new Http({ cache: new MemoryCache(), timeoutMs: 45_000, minIntervalMs: { "api.crossref.org": 1100, "eutils.ncbi.nlm.nih.gov": 400, "www.wikidata.org": 1000 } });
  const service = new ResearchService([
    new EuropePmcConnector(http), new PubMedConnector(http), new CrossrefConnector(http), new HalConnector(http), new OpenAlexConnector(http, undefined, process.env.OPENALEX_API_KEY), new WikipediaConnector(http), new WikidataConnector(http),
  ], { perConnectorLimit: 4 });
  const out: string[] = [
    "# Démonstration du moteur documentaire V1",
    "",
    `Générée le ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC par \`pnpm research:demo\`, contre les vraies API publiques.`,
    "La vérification des affirmations par le modèle n'est pas incluse : elle demande Qwen3 sur le PC de développement.",
    "",
  ];
  for (const t of TOPICS) {
    const r = await service.search(t.queries);
    const allowed = r.documents.filter((d) => d.license.allowedForGeneration).length;
    out.push(`## ${t.level} : ${t.queries.map((q) => `« ${q.query} »`).join(" / ")}`, "");
    out.push("| Connecteur | Résultat | Durée |", "|---|---|---|");
    for (const [id, c] of Object.entries(r.connectors)) out.push(`| ${id} | ${c.ok ? `${c.count} documents` : `erreur : ${c.error}`} | ${(c.ms / 1000).toFixed(1)} s |`);
    out.push("", `${r.documents.length} documents après déduplication, dont ${allowed} dont le texte peut être transmis au modèle (licence).`, "");
    out.push("| Rang | Type de preuve | Licence | → modèle | Sources | Référence |", "|---|---|---|---|---|---|");
    for (const d of r.documents.slice(0, 12)) {
      out.push(`| ${d.reliabilityTier} | ${d.evidenceLevel} | ${d.license.code} | ${d.license.allowedForGeneration ? "oui" : "non"} | ${d.providers.join(", ")} | ${d.citation.replace(/\|/g, "/").slice(0, 160)} |`);
    }
    out.push("");
  }
  writeFileSync(new URL("../../docs/research/DEMO.md", import.meta.url), out.join("\n"));
}, 600_000);
