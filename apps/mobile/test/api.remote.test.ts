/**
 * Les appels de l'application, contre le vrai projet Supabase et avec la vraie clé
 * publique embarquée dans l'app (src/config.ts). Crée un utilisateur jetable,
 * puis supprime tout. Lancement : pnpm test:remote nejqievnldeqiasqsdlj
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIO_BUCKET, cancelGeneration, createEpisode, getEpisodeDetail, listEpisodes, playbackPaths, signedUrls,
} from "../src/api";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../src/config";

const randomUUID = () => globalThis.crypto.randomUUID();

const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
let userId: string;
let sb: SupabaseClient;
let episodeId: string;
const sourceKey = `test:${randomUUID()}`;

beforeAll(async () => {
  expect(SUPABASE_URL).toBe(process.env.SUPABASE_URL);
  const email = `app-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST", headers: { ...svc, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`create_user ${r.status} ${await r.text()}`);
  userId = ((await r.json()) as { id: string }).id;
  sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
});

afterAll(async () => {
  if (episodeId) await fetch(`${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}`, {
    method: "DELETE", headers: { ...svc, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [`${userId}/${episodeId}/segments/0001-a.mp3`, `${userId}/${episodeId}/segments/0002-b.mp3`] }),
  }).catch(() => {});
  if (userId) await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/sources?canonical_key=eq.${encodeURIComponent(sourceKey)}`, { method: "DELETE", headers: svc }).catch(() => {});
});

describe("application mobile ↔ Supabase", () => {
  it("crée un épisode et le met en file, une seule fois pour la même clé", async () => {
    const r = await createEpisode(sb, { topic: "Pourquoi le ciel est bleu", outputLocale: "fr-FR", durationMinutes: 5, requireOutlineApproval: false, idempotencyKey: "key-0001" });
    episodeId = r.episodeId;
    const again = await sb.rpc("request_generation", { p_episode_id: episodeId, p_idempotency_key: "key-0001" });
    expect(again.data).toBe(r.jobId);
    const list = await listEpisodes(sb);
    expect(list.map((e) => [e.id, e.status])).toEqual([[episodeId, "queued"]]);
  });

  it("refuse une durée au-delà de l'offre gratuite, avec un code d'erreur traduisible", async () => {
    await expect(createEpisode(sb, { topic: "Un autre sujet", outputLocale: "en-GB", durationMinutes: 30, requireOutlineApproval: false, idempotencyKey: "key-0002" }))
      .rejects.toMatchObject({ code: "duration_not_allowed" });
    // Le brouillon refusé est supprimé : la bibliothèque ne montre que l'épisode valide.
    expect((await listEpisodes(sb)).map((e) => e.id)).toEqual([episodeId]);
  });

  it("lit le détail : sources embarquées, segments signés dans l'ordre", async () => {
    // Ce que le worker aurait produit (rôle de service).
    const src = await fetch(`${SUPABASE_URL}/rest/v1/sources`, {
      method: "POST", headers: { ...svc, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ title: "Rayleigh scattering", url: "https://example.org/r", canonical_key: sourceKey, citation: "Doe J. Rayleigh scattering. 2020.", license_code: "CC-BY-4.0" }),
    });
    expect(src.status, await src.clone().text()).toBe(201);
    const [{ id: sourceId }] = (await src.json()) as { id: string }[];
    const es = await fetch(`${SUPABASE_URL}/rest/v1/episode_sources`, {
      method: "POST", headers: { ...svc, "Content-Type": "application/json" },
      body: JSON.stringify({ episode_id: episodeId, user_id: userId, source_id: sourceId, quality_tier: 3 }),
    });
    expect(es.status, await es.clone().text()).toBe(201);
    for (const [name, at] of [["0002-b", "2026-11-19T10:00:00Z"], ["0001-a", "2026-11-19T10:00:00Z"]] as const) {
      const path = `${userId}/${episodeId}/segments/${name}.mp3`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${path}`, { method: "POST", headers: { ...svc, "Content-Type": "audio/mpeg" }, body: new Uint8Array([0xff, 0xfb, 0x50, 0x00]) });
      expect(up.ok).toBe(true);
      const a = await fetch(`${SUPABASE_URL}/rest/v1/audio_assets`, {
        method: "POST", headers: { ...svc, "Content-Type": "application/json" },
        body: JSON.stringify({ episode_id: episodeId, user_id: userId, kind: "segment", status: "ready", storage_path: path, created_at: at }),
      });
      expect(a.status, await a.clone().text()).toBe(201);
    }

    const d = await getEpisodeDetail(sb, episodeId);
    expect(d.episode.status).toBe("queued");
    expect(d.sources).toEqual([expect.objectContaining({ quality_tier: 3, sources: expect.objectContaining({ citation: "Doe J. Rayleigh scattering. 2020.", license_code: "CC-BY-4.0" }) })]);
    const paths = playbackPaths(d.audio);
    expect(paths.map((p) => p.split("/").pop())).toEqual(["0001-a.mp3", "0002-b.mp3"]);
    const urls = await signedUrls(sb, paths);
    const audio = await fetch(urls[0]!);
    expect(audio.status).toBe(200);
    expect(new Uint8Array(await audio.arrayBuffer())[0]).toBe(0xff);
  });

  it("annule la génération", async () => {
    await cancelGeneration(sb, episodeId);
    expect((await getEpisodeDetail(sb, episodeId)).episode.status).toBe("cancelled");
  });
});
