/**
 * Suppression de compte de bout en bout (base de test + stockage local) :
 * plus aucune ligne, plus aucun fichier, y compris un fichier orphelin.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalDirStore, processStorageDeletions } from "../src/index.js";

const pool = new pg.Pool({ database: process.env.TEST_DB ?? "app_test", max: 2 });
afterAll(() => pool.end());

let store: LocalDirStore;
beforeAll(async () => {
  store = new LocalDirStore(await mkdtemp(join(tmpdir(), "audio-del-")));
  await pool.query("update public.storage_deletion_queue set processed_at = now() where processed_at is null");
});

async function userWithFiles() {
  const { rows: [u] } = await pool.query<{ id: string }>("insert into auth.users (id, email) values (gen_random_uuid(), 'del@test.local') returning id");
  const { rows: [e] } = await pool.query<{ id: string }>("insert into public.episodes (user_id, topic_prompt) values ($1, 'Sujet') returning id", [u!.id]);
  const tracked = `${u!.id}/${e!.id}/full.mp3`;
  const orphan = `${u!.id}/${e!.id}/segments/0001-orphelin.mp3`;
  await store.put(tracked, new Uint8Array([1]));
  await store.put(orphan, new Uint8Array([2]));
  await pool.query("insert into public.audio_assets (episode_id, user_id, kind, status, storage_path) values ($1, $2, 'full', 'ready', $3)", [e!.id, u!.id, tracked]);
  return { userId: u!.id, tracked, orphan };
}

describe("suppression de compte de bout en bout", () => {
  it("supprime les lignes puis tous les fichiers du dossier, orphelins compris", async () => {
    const other = await userWithFiles();
    const { userId, tracked } = await userWithFiles();
    expect(await store.list(`${userId}/`)).toHaveLength(2);

    await pool.query("delete from auth.users where id = $1", [userId]);
    const n = await processStorageDeletions(pool, { "episode-audio": store });

    expect(n).toBe(2); // le fichier suivi + le dossier complet
    expect(await store.list(`${userId}/`)).toEqual([]);
    const rows = await pool.query("select 1 from public.audio_assets where storage_path = $1", [tracked]);
    expect(rows.rowCount).toBe(0);
    expect(await store.list(`${other.userId}/`)).toHaveLength(2); // l'autre compte n'est pas touché
    expect(await processStorageDeletions(pool, { "episode-audio": store })).toBe(0); // file vide
  });

  it("garde l'entrée en file si la suppression échoue, et la reprend ensuite", async () => {
    const { userId } = await userWithFiles();
    await pool.query("delete from auth.users where id = $1", [userId]);
    const failing = Object.assign(Object.create(store) as LocalDirStore, { remove: async () => { throw new Error("storage_503"); } });
    await expect(processStorageDeletions(pool, { "episode-audio": failing })).rejects.toThrow("storage_503");
    const pending = await pool.query("select 1 from public.storage_deletion_queue where processed_at is null");
    expect(pending.rowCount).toBe(2);
    expect(await processStorageDeletions(pool, { "episode-audio": store })).toBe(2);
    expect(await store.list(`${userId}/`)).toEqual([]);
  });
});
