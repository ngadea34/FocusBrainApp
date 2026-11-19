import type { ResearchDocument } from "./types.js";

/** Référence lisible et déterministe (style auteur-date simplifié). */
export function formatCitation(d: Pick<ResearchDocument, "authors" | "publicationDate" | "title" | "ids" | "url" | "sourceProvider"> & { container?: string | null }): string {
  const authors = d.authors.length === 0 ? "" : d.authors.length > 3 ? `${d.authors.slice(0, 3).join(", ")} et al.` : d.authors.join(", ");
  const year = d.publicationDate?.slice(0, 4) ?? "s. d.";
  const where = d.container ? ` ${d.container}.` : "";
  const id = d.ids.doi ? ` doi:${d.ids.doi}` : d.ids.pmid ? ` PMID:${d.ids.pmid}` : d.url ? ` ${d.url}` : "";
  return `${authors ? `${authors} ` : ""}(${year}). ${d.title.replace(/\.$/, "")}.${where}${id}`.trim();
}
