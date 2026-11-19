import { dedupe } from "./dedupe.js";
import type { Connector, ResearchDocument } from "./types.js";

export interface ResearchConfig {
  /** Connecteurs désactivés individuellement (brief §2), ex. ["openalex"]. */
  disabled?: readonly string[];
  perConnectorLimit?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export interface ResearchReport {
  documents: ResearchDocument[];
  /** Par connecteur : nombre de résultats ou erreur (une source en panne n'arrête pas la recherche). */
  connectors: Record<string, { ok: boolean; count: number; error?: string; ms: number }>;
}

/**
 * Point d'entrée unique des moteurs métier. Interroge les connecteurs actifs en parallèle,
 * isole les pannes, déduplique, puis classe par fiabilité (jamais par popularité).
 */
export class ResearchService {
  constructor(private readonly connectors: readonly Connector[], private readonly config: ResearchConfig = {}) {}

  get active(): Connector[] {
    const off = new Set(this.config.disabled ?? []);
    return this.connectors.filter((c) => !off.has(c.id));
  }

  async search(queries: ReadonlyArray<{ query: string; locale: string }>, signal?: AbortSignal): Promise<ResearchReport> {
    const report: ResearchReport["connectors"] = {};
    const all: ResearchDocument[] = [];
    await Promise.all(this.active.map(async (c) => {
      const t0 = Date.now();
      let count = 0;
      const errors: string[] = [];
      for (const q of queries) {
        if (c.locales !== "any" && !c.locales.includes(q.locale)) continue;
        try {
          const docs = await c.search(q.query, q.locale, { limit: this.config.perConnectorLimit ?? 5, ...(signal ? { signal } : {}) });
          all.push(...docs);
          count += docs.length;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      report[c.id] = { ok: errors.length === 0, count, ms: Date.now() - t0, ...(errors.length ? { error: errors.join("; ").slice(0, 300) } : {}) };
      this.config.log?.("research_connector", { connector: c.id, ...report[c.id] });
    }));
    const documents = dedupe(all)
      .filter((d) => d.publicationStatus !== "retracted")
      .sort((a, b) => a.reliabilityTier - b.reliabilityTier);
    return { documents, connectors: report };
  }
}

/** Contenu transmissible au modèle de génération : seulement si la licence l'autorise (brief §5). */
export function generationContent(d: ResearchDocument): string | null {
  return d.license.allowedForGeneration ? d.abstract : null;
}
