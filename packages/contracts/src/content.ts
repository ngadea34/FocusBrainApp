import { z } from "zod";
import { CLAIM_STATUSES, type ClaimStatus, SOURCE_KINDS, type SourceKind } from "./enums.js";

/** Plan d'épisode (outline_versions.content). Validé aussi côté SQL (forme minimale). */
export const outlineSectionSchema = z
  .object({
    title: z.string().min(1).max(200),
    goal: z.string().max(1000).optional(),
    concepts: z.array(z.string().max(200)).max(30).default([]),
    estimatedMinutes: z.number().positive().max(60).optional(),
  })
  .strict();

export const outlineSchema = z
  .object({
    sections: z.array(outlineSectionSchema).min(1).max(40),
    openQuestions: z.array(z.string().max(500)).max(20).default([]),
  })
  .strict();
export type Outline = z.infer<typeof outlineSchema>;

/** Hiérarchie indicative des sources (dossier §6, SourceEvaluator). 1 = plus fiable. */
export const SOURCE_TIER: Record<SourceKind, number> = {
  scientific_article: 1,
  systematic_review: 2,
  public_institution: 3,
  university: 4,
  reference_book: 5,
  popular_science: 6,
  other: 6,
};

/**
 * Règle documentaire centrale : seule une affirmation confirmée peut être
 * énoncée comme un fait établi. « nuancée » exige une formulation prudente,
 * « non vérifiée » doit être signalée comme telle, « rejetée » est retirée.
 */
export type ClaimPresentation = "state_as_fact" | "state_with_nuance" | "flag_as_unverified" | "remove";

export function claimPresentation(status: ClaimStatus): ClaimPresentation {
  switch (status) {
    case "confirmed":
      return "state_as_fact";
    case "nuanced":
      return "state_with_nuance";
    case "unverified":
      return "flag_as_unverified";
    case "rejected":
      return "remove";
  }
}

export const claimStatusSchema = z.enum(CLAIM_STATUSES);
export const sourceKindSchema = z.enum(SOURCE_KINDS);

/** Preuve rattachée à une affirmation : la citation originale est conservée telle quelle. */
export const evidenceSchema = z
  .object({
    sourceId: z.string().uuid(),
    support: z.enum(["supports", "qualifies", "contradicts"]),
    quoteOriginal: z.string().max(2000).optional(),
    quoteLocale: z.string().optional(),
    translation: z.string().max(2000).optional(),
    translationLocale: z.string().optional(),
    locator: z.string().max(200).optional(),
  })
  .strict()
  .refine((e) => e.translation === undefined || e.translationLocale !== undefined, {
    message: "Une traduction doit déclarer sa langue",
  });
