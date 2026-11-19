import type { AudioStore } from "./synthesis.js";

/**
 * Supabase Storage via son API HTTP, avec la clé de service (côté worker uniquement,
 * jamais dans l'application mobile).
 */
export class SupabaseStore implements AudioStore {
  readonly bucket: string;
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { url: string; serviceKey: string; bucket?: string; fetchImpl?: typeof fetch }) {
    this.bucket = opts.bucket ?? "episode-audio";
    this.base = `${opts.url.replace(/\/$/, "")}/storage/v1`;
    this.headers = { apikey: opts.serviceKey, Authorization: `Bearer ${opts.serviceKey}` };
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const res = await this.fetchImpl(`${this.base}${path}`, { ...init, headers: { ...this.headers, ...init.headers } });
    if (!res.ok) {
      const err = new Error(`storage_${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return res;
  }

  async put(path: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    await this.call(`/object/${this.bucket}/${encodePath(path)}`, {
      method: "POST", headers: { "Content-Type": mimeType, "x-upsert": "true" }, body: bytes,
    });
  }

  async remove(paths: readonly string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 1000) {
      await this.call(`/object/${this.bucket}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths.slice(i, i + 1000) }),
      });
    }
  }

  async list(prefix: string): Promise<string[]> {
    const dir = prefix.replace(/\/$/, "");
    const out: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await this.call(`/object/list/${this.bucket}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: dir, limit: 1000, offset }),
      });
      const items = (await res.json()) as { name: string; id: string | null }[];
      for (const it of items) {
        const full = `${dir}/${it.name}`;
        if (it.id === null) out.push(...(await this.list(`${full}/`))); // dossier
        else out.push(full);
      }
      if (items.length < 1000) return out;
    }
  }
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");
