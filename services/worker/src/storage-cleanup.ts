import type pg from "pg";
import type { AudioStore } from "./synthesis.js";

/**
 * Vide la file storage_deletion_queue (alimentée par la suppression d'audio et de comptes).
 * Une entrée n'est marquée traitée qu'après la suppression effective : en cas d'erreur,
 * elle sera reprise au passage suivant. Renvoie le nombre d'entrées traitées.
 */
export async function processStorageDeletions(pool: pg.Pool, stores: Readonly<Record<string, AudioStore>>, batch = 50): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const { rows } = await c.query<{ id: string; storage_bucket: string; storage_path: string; is_prefix: boolean }>(
      `select id, storage_bucket, storage_path, is_prefix from public.storage_deletion_queue
        where processed_at is null order by id limit $1 for update skip locked`, [batch]);
    const done: string[] = [];
    for (const r of rows) {
      const store = stores[r.storage_bucket];
      if (!store) continue; // bucket inconnu : laissé en file, visible par l'admin
      const paths = r.is_prefix ? await store.list(r.storage_path) : [r.storage_path];
      if (paths.length) await store.remove(paths);
      done.push(r.id);
    }
    if (done.length) {
      await c.query("update public.storage_deletion_queue set processed_at = now() where id = any($1::bigint[])", [done]);
    }
    await c.query("commit");
    return done.length;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
