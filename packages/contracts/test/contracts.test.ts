import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as C from "../src/index.js";

const migrationsDir = join(import.meta.dirname, "../../../supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

function sqlEnum(name: string): string[] {
  const m = new RegExp(`create type public\\.${name}\\s+as enum \\(([^)]*)\\)`, "s").exec(sql);
  if (!m?.[1]) throw new Error(`enum ${name} introuvable`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
}

describe("alignement TypeScript ↔ SQL", () => {
  const pairs: Array<[string, readonly string[]]> = [
    ["episode_status", C.EPISODE_STATUSES],
    ["depth_level", C.DEPTH_LEVELS],
    ["density_level", C.DENSITY_LEVELS],
    ["structure_kind", C.STRUCTURE_KINDS],
    ["digression_level", C.DIGRESSION_LEVELS],
    ["speech_rate", C.SPEECH_RATES],
    ["repetition_level", C.REPETITION_LEVELS],
    ["narration_tone", C.NARRATION_TONES],
    ["source_kind", C.SOURCE_KINDS],
    ["claim_status", C.CLAIM_STATUSES],
    ["evidence_support", C.EVIDENCE_SUPPORTS],
    ["audio_kind", C.AUDIO_KINDS],
    ["asset_status", C.ASSET_STATUSES],
    ["step_type", C.STEP_TYPES],
    ["step_status", C.STEP_STATUSES],
    ["cost_category", C.COST_CATEGORIES],
    ["subscription_status", C.SUBSCRIPTION_STATUSES],
    ["billing_provider", C.BILLING_PROVIDERS],
  ];
  it.each(pairs)("enum %s identique", (name, ts) => {
    expect(sqlEnum(name)).toEqual([...ts]);
  });

  it("transitions identiques à public.is_valid_transition", () => {
    const fn = /function public\.is_valid_transition[\s\S]*?else \(f, t\) in \(([\s\S]*?)\$\$;/.exec(sql)?.[1] ?? "";
    const sqlPairs = [...fn.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    expect(sqlPairs).toEqual(C.TRANSITIONS.map(([f, t]) => `${f}>${t}`).sort());
  });

  it("durées identiques à la contrainte SQL", () => {
    expect(sql).toContain(`duration_minutes in (${C.DURATIONS_MINUTES.join(", ")})`);
  });
});

describe("machine à états", () => {
  it("accepte le chemin nominal complet", () => {
    const path: C.EpisodeStatus[] = ["draft", "queued", "researching", "outlining", "awaiting_approval",
      "writing", "verifying", "synthesizing", "assembling", "ready"];
    for (let i = 1; i < path.length; i++) expect(C.isValidTransition(path[i - 1]!, path[i]!)).toBe(true);
  });
  it("refuse les sauts et les sorties d'un état terminal", () => {
    expect(C.isValidTransition("queued", "ready")).toBe(false);
    expect(C.isValidTransition("ready", "failed")).toBe(false);
    expect(C.isValidTransition("cancelled", "queued")).toBe(false);
    expect(C.isValidTransition("draft", "cancelled")).toBe(false);
  });
  it("autorise l'échec ou l'annulation depuis tout état actif", () => {
    expect(C.isValidTransition("synthesizing", "failed")).toBe(true);
    expect(C.isValidTransition("awaiting_approval", "cancelled")).toBe(true);
    expect(C.isValidTransition("failed", "queued")).toBe(true);
  });
});

describe("langues BCP 47", () => {
  it("canonicalise", () => {
    expect(C.canonicalLocale("fr-fr")).toBe("fr-FR");
    expect(C.canonicalLocale("EN-gb")).toBe("en-GB");
    expect(C.canonicalLocale("es")).toBe("es");
  });
  it("refuse les étiquettes invalides ou non prises en charge par le schéma", () => {
    expect(C.canonicalLocale("français")).toBeNull();
    expect(C.canonicalLocale("en-GB-u-ca-gregory")).toBeNull();
  });
  it("le schéma zod normalise", () => {
    expect(C.localeTag.parse("fr-fr")).toBe("fr-FR");
    expect(() => C.localeTag.parse("xx_YY")).toThrow();
  });
});

describe("paramètres d'épisode", () => {
  it("les valeurs neutres sont valides", () => {
    expect(C.episodeSettingsSchema.parse(C.NEUTRAL_DEFAULT_SETTINGS)).toEqual(C.NEUTRAL_DEFAULT_SETTINGS);
  });
  it("fusionne profil d'écoute puis choix ponctuels", () => {
    const s = C.resolveSettings(C.NEUTRAL_DEFAULT_SETTINGS, { depth: "expert", speechRate: "slow" }, { speechRate: "fast" });
    expect(s).toMatchObject({ depth: "expert", speechRate: "fast", durationMinutes: 15 });
  });
  it("refuse une durée non prévue et les champs inconnus", () => {
    expect(() => C.resolveSettings(C.NEUTRAL_DEFAULT_SETTINGS, { durationMinutes: 20 as never })).toThrow();
    expect(() => C.episodeSettingsSchema.parse({ ...C.NEUTRAL_DEFAULT_SETTINGS, diagnosis: "x" })).toThrow();
  });
  it("valide une demande d'épisode", () => {
    const r = C.newEpisodeRequestSchema.parse({
      topicPrompt: "  Pourquoi rêvons-nous ?  ", outputLocale: "fr-fr", researchLocales: ["fr-FR", "en-gb"],
      settings: C.NEUTRAL_DEFAULT_SETTINGS,
    });
    expect(r.topicPrompt).toBe("Pourquoi rêvons-nous ?");
    expect(r.researchLocales).toEqual(["fr-FR", "en-GB"]);
  });
});

describe("règles documentaires", () => {
  it("seule une affirmation confirmée est énoncée comme un fait", () => {
    expect(C.CLAIM_STATUSES.filter((s) => C.claimPresentation(s) === "state_as_fact")).toEqual(["confirmed"]);
    expect(C.claimPresentation("unverified")).toBe("flag_as_unverified");
    expect(C.claimPresentation("rejected")).toBe("remove");
  });
  it("une traduction doit déclarer sa langue", () => {
    const sourceId = "6f1c1b5e-4f5d-4a7c-9a0e-2b8f4c1d2e3f";
    expect(() => C.evidenceSchema.parse({ sourceId, support: "supports", translation: "texte" })).toThrow();
    expect(C.evidenceSchema.parse({ sourceId, support: "supports", translation: "texte", translationLocale: "fr-FR" })).toBeTruthy();
  });
  it("hiérarchie des sources : publication scientifique avant vulgarisation", () => {
    expect(C.SOURCE_TIER.scientific_article).toBeLessThan(C.SOURCE_TIER.popular_science);
  });
  it("plan : au moins une section", () => {
    expect(() => C.outlineSchema.parse({ sections: [] })).toThrow();
    expect(C.outlineSchema.parse({ sections: [{ title: "Intro" }] }).sections[0]?.concepts).toEqual([]);
  });
});
