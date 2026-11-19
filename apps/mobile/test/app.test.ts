import { describe, expect, it } from "vitest";
import { EPISODE_STATUSES } from "@app/contracts";
import {
  createEpisode, isActive, playbackPaths, progressOf, researchLocalesFor, signedUrls, titleFromTopic, toAppError,
  type AudioAssetRow,
} from "../src/api";
import { DICTIONARIES, defaultOutputLocale, format, uiLanguageFor } from "../src/i18n";

const U = "11111111-1111-1111-1111-111111111111";
const E = "22222222-2222-2222-2222-222222222222";
const seg = (pos: string, at: string, hash = "abc"): AudioAssetRow =>
  ({ id: pos + at, kind: "segment", storage_path: `${U}/${E}/segments/${pos}-${hash}.mp3`, duration_ms: 1000, created_at: at });

describe("lecture", () => {
  it("joue les segments dans l'ordre et garde le plus récent par position", () => {
    const paths = playbackPaths([
      seg("0002", "2026-11-19T10:00:00Z"), seg("0001", "2026-11-19T10:00:00Z", "old"),
      seg("0001", "2026-11-19T11:00:00Z", "new"), seg("0010", "2026-11-19T10:00:00Z"),
    ]);
    expect(paths).toEqual([`${U}/${E}/segments/0001-new.mp3`, `${U}/${E}/segments/0002-abc.mp3`, `${U}/${E}/segments/0010-abc.mp3`]);
  });

  it("préfère le fichier complet quand il existe", () => {
    const full: AudioAssetRow = { id: "f", kind: "full", storage_path: `${U}/${E}/episode.mp3`, duration_ms: 9, created_at: "2026-11-19T12:00:00Z" };
    expect(playbackPaths([seg("0001", "2026-11-19T10:00:00Z"), full])).toEqual([full.storage_path]);
  });

  it("signe les liens dans l'ordre demandé et échoue si un lien manque", async () => {
    const sb = { storage: { from: () => ({ createSignedUrls: async (paths: string[], ttl: number) => ({
      data: [...paths].reverse().map((p) => ({ path: p, signedUrl: `https://s/${p}?ttl=${ttl}`, error: null })), error: null,
    }) }) } };
    expect(await signedUrls(sb as never, ["a", "b"])).toEqual(["https://s/a?ttl=3600", "https://s/b?ttl=3600"]);
    const broken = { storage: { from: () => ({ createSignedUrls: async () => ({ data: [{ path: "a", signedUrl: "", error: "not found" }], error: null }) }) } };
    await expect(signedUrls(broken as never, ["a"])).rejects.toThrow(/signed_url_failed/);
  });
});

describe("création d'épisode", () => {
  it("insère l'épisode, ses paramètres, puis demande la génération avec la clé d'idempotence", async () => {
    const calls: [string, unknown][] = [];
    const sb = {
      auth: { getUser: async () => ({ data: { user: { id: U } } }) },
      from: (table: string) => ({
        insert: (row: unknown) => {
          calls.push([table, row]);
          const r = { data: table === "episodes" ? { id: E } : null, error: null };
          return Object.assign(Promise.resolve(r), { select: () => ({ single: async () => r }) });
        },
      }),
      rpc: async (fn: string, args: unknown) => { calls.push([fn, args]); return { data: "job-1", error: null }; },
    };
    const r = await createEpisode(sb as never, { topic: "  Pourquoi le ciel est bleu ", outputLocale: "fr-FR", durationMinutes: 5, requireOutlineApproval: false, idempotencyKey: "k1" });
    expect(r).toEqual({ episodeId: E, jobId: "job-1" });
    expect(calls).toEqual([
      ["episodes", { user_id: U, title: "Pourquoi le ciel est bleu", topic_prompt: "Pourquoi le ciel est bleu", output_locale: "fr-FR", research_locales: ["fr-FR", "en-GB"] }],
      ["episode_settings", { episode_id: E, user_id: U, duration_minutes: 5, require_outline_approval: false }],
      ["request_generation", { p_episode_id: E, p_idempotency_key: "k1" }],
    ]);
  });

  it("supprime le brouillon si la génération est refusée", async () => {
    const deleted: string[] = [];
    const sb = {
      auth: { getUser: async () => ({ data: { user: { id: U } } }) },
      from: (table: string) => ({
        insert: () => {
          const r = { data: table === "episodes" ? { id: E } : null, error: null };
          return Object.assign(Promise.resolve(r), { select: () => ({ single: async () => r }) });
        },
        delete: () => ({ eq: async (_c: string, id: string) => { deleted.push(`${table}:${id}`); return { error: null }; } }),
      }),
      rpc: async () => ({ data: null, error: { message: "quota_exceeded" } }),
    };
    await expect(createEpisode(sb as never, { topic: "Sujet", outputLocale: "fr-FR", durationMinutes: 5, requireOutlineApproval: false, idempotencyKey: "key-0001" }))
      .rejects.toMatchObject({ code: "quota_exceeded" });
    expect(deleted).toEqual([`episodes:${E}`]);
  });

  it("traduit les erreurs SQL connues", async () => {
    expect(toAppError({ message: "quota_exceeded" }).code).toBe("quota_exceeded");
    expect(toAppError({ message: "duration_not_allowed: max 15 minutes" }).code).toBe("duration_not_allowed");
    expect(toAppError(new Error("boom")).code).toBe("unknown");
  });

  it("titre court et langues de recherche", () => {
    expect(titleFromTopic("a".repeat(100))).toHaveLength(80);
    expect(researchLocalesFor("en-GB")).toEqual(["en-GB", "fr-FR"]);
  });
});

describe("avancement", () => {
  it("compte les étapes réussies hors annulées", () => {
    expect(progressOf([{ step_type: "intent", status: "succeeded" }, { step_type: "research", status: "running" }, { step_type: "x", status: "cancelled" }]))
      .toEqual({ done: 1, total: 2 });
    expect(isActive("queued")).toBe(true);
    expect(isActive("awaiting_approval")).toBe(false);
  });
});

describe("textes FR/EN", () => {
  const keys = (o: object, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

  it("le français et l'anglais ont exactement les mêmes clés, sans texte vide", () => {
    expect(keys(DICTIONARIES.en).sort()).toEqual(keys(DICTIONARIES.fr).sort());
    for (const d of Object.values(DICTIONARIES)) for (const k of keys(d)) {
      const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], d);
      expect(String(v).trim(), k).not.toBe("");
    }
  });

  it("chaque statut d'épisode a un libellé", () => {
    for (const s of EPISODE_STATUSES) { expect(DICTIONARIES.fr.status[s]).toBeTruthy(); expect(DICTIONARIES.en.status[s]).toBeTruthy(); }
  });

  it("choisit la langue de l'interface depuis le téléphone", () => {
    expect(uiLanguageFor(["de-DE", "en-US"])).toBe("en");
    expect(uiLanguageFor(["fr-FR"])).toBe("fr");
    expect(uiLanguageFor(["ja-JP"])).toBe("fr");
    expect(defaultOutputLocale("en")).toBe("en-GB");
    expect(format("{done} sur {total}", { done: 2, total: 5 })).toBe("2 sur 5");
  });
});
