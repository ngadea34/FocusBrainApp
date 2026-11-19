import { z } from "zod";

/**
 * Rôles linguistiques distincts (dossier §7). Ne jamais les confondre :
 * une traduction n'est jamais une citation littérale de la source.
 */
export interface LocaleContext {
  /** Langue de l'interface de l'application. */
  interface: string;
  /** Langues dans lesquelles la recherche documentaire est menée. */
  research: string[];
  /** Langue de restitution du podcast. */
  output: string;
}

/** Langues prises en charge au lancement (extensible sans migration). */
export const LAUNCH_LOCALES = ["fr-FR", "en-GB", "en-US"] as const;

/** Même règle que public.is_bcp47 en SQL : langue[-Script][-REGION]. */
const SQL_COMPATIBLE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;

/** Canonicalise une étiquette BCP 47 (ex. "fr-fr" → "fr-FR") ou renvoie null. */
export function canonicalLocale(tag: string): string | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag);
    return canonical !== undefined && SQL_COMPATIBLE.test(canonical) ? canonical : null;
  } catch {
    return null;
  }
}

export const localeTag = z
  .string()
  .transform((v, ctx) => {
    const c = canonicalLocale(v);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: `Étiquette BCP 47 invalide : ${v}` });
      return z.NEVER;
    }
    return c;
  });

/** Langue principale d'une étiquette (« fr-FR » → « fr »), utile pour choisir une voix. */
export function primaryLanguage(tag: string): string {
  return tag.split("-")[0] ?? tag;
}
