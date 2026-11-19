import { createHash } from "node:crypto";

/**
 * Découpage du script en segments vocaux et reprise :
 * une erreur sur un segment ne doit pas obliger à tout refaire (dossier §9).
 * La clé d'un segment = hash(texte + voix + débit + langue) : si rien ne change,
 * l'audio déjà produit est réutilisé.
 */
export interface Segment {
  index: number;
  sectionPosition: number;
  text: string;
  key: string;
}

export interface SegmentContext {
  voiceId: string;
  speechRate: string;
  locale: string;
}

export function segmentKey(text: string, ctx: SegmentContext): string {
  return createHash("sha256")
    .update(JSON.stringify([ctx.locale, ctx.voiceId, ctx.speechRate, text.normalize("NFC")]))
    .digest("hex");
}

/** Coupe aux fins de phrase, sans dépasser maxChars (sauf phrase unique plus longue, coupée aux espaces). */
export function splitText(text: string, maxChars: number): string[] {
  if (maxChars < 20) throw new RangeError("maxChars trop petit");
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…»"])\s+(?=[«"A-ZÀ-ÖØ-Þ0-9])/u)
    .filter((s) => s.length > 0);
  const out: string[] = [];
  let current = "";
  const push = () => {
    if (current) out.push(current);
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      push();
      let rest = sentence;
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(" ", maxChars);
        const at = cut > maxChars / 2 ? cut : maxChars;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
      continue;
    }
    if (current && current.length + 1 + sentence.length > maxChars) push();
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();
  return out;
}

export function buildSegments(
  sections: ReadonlyArray<{ position: number; body: string }>,
  ctx: SegmentContext,
  maxChars = 2500,
): Segment[] {
  const segments: Segment[] = [];
  for (const section of [...sections].sort((a, b) => a.position - b.position)) {
    for (const text of splitText(section.body, maxChars)) {
      segments.push({ index: segments.length, sectionPosition: section.position, text, key: segmentKey(text, ctx) });
    }
  }
  return segments;
}

/** Segments à (re)synthétiser : ceux dont aucun audio prêt ne porte la même clé. */
export function segmentsToSynthesize(segments: readonly Segment[], readyKeys: ReadonlySet<string>): Segment[] {
  return segments.filter((s) => !readyKeys.has(s.key));
}
