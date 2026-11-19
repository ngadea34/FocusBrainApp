import type { LicenseInfo } from "./types.js";

/**
 * Normalise une licence et décide si le contenu peut nourrir la génération (brief §5).
 * Règle prudente : sans licence ouverte explicite, le texte n'est PAS transmis au modèle
 * (seules les métadonnées le sont). Ce n'est pas un avis juridique : à valider (décision D9).
 */
export function normalizeLicense(raw: string | null | undefined): LicenseInfo {
  const r = (raw ?? "").trim();
  const s = r.toLowerCase().replace(/[_\s]+/g, "-");
  const make = (code: string, commercialUse: boolean, derivatives: boolean): LicenseInfo =>
    ({ raw: r || null, code, commercialUse, derivatives, allowedForGeneration: commercialUse && derivatives });

  if (!s) return make("unknown", false, false);
  if (/publicdomain\/zero|cc0|cc-zero/.test(s)) return make("cc0", true, true);
  if (/public-?domain|publicdomain\/mark/.test(s)) return make("public-domain", true, true);
  const cc = /(?:creativecommons\.org\/licenses\/|cc-?)(by(?:-nc)?(?:-nd|-sa)?)/.exec(s);
  if (cc) {
    const kind = cc[1]!;
    const nc = kind.includes("nc");
    const nd = kind.includes("nd");
    return make(`cc-${kind}`, !nc, !nd);
  }
  // Licences d'éditeur, « tous droits réservés », autorisations HAL, licences TDM : restrictives par défaut.
  return make("restricted", false, false);
}
