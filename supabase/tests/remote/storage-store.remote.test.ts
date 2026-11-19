/**
 * Adaptateur SupabaseStore sur le projet réel : dépôt, liste récursive, suppression.
 * Utilise un dossier jetable qui est supprimé à la fin.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { SupabaseStore } from "../../../services/worker/src/supabase-store.js";

const store = new SupabaseStore({ url: process.env.SUPABASE_URL!, serviceKey: process.env.SUPABASE_SERVICE_KEY! });
const root = `${randomUUID()}/`;
const files = [`${root}ep/full.mp3`, `${root}ep/segments/0001-a.mp3`, `${root}ep/segments/0002-b.mp3`];

afterAll(async () => { await store.remove(await store.list(root)).catch(() => {}); });

describe("SupabaseStore (projet réel)", () => {
  it("dépose, liste récursivement puis supprime tout un dossier", async () => {
    for (const f of files) await store.put(f, new Uint8Array([0xff, 0xfb, 0x50, 0x00]), "audio/mpeg");
    expect((await store.list(root)).sort()).toEqual([...files].sort());
    await store.remove(await store.list(root));
    expect(await store.list(root)).toEqual([]);
  });

  it("supprimer un fichier absent n'est pas une erreur", async () => {
    await expect(store.remove([`${root}absent.mp3`])).resolves.toBeUndefined();
  });
});
