/**
 * Accès HTTP commun aux connecteurs (brief §2) : délai d'attente, reprises avec
 * attente croissante sur 429/5xx (en respectant Retry-After, plafonné), espacement
 * minimal par hôte, cache des réponses, User-Agent configurable.
 */
export interface Cache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Cache mémoire borné (LRU simple). En production : table Postgres ou Redis derrière la même interface. */
export class MemoryCache implements Cache {
  private readonly map = new Map<string, { v: string; exp: number }>();
  constructor(private readonly max = 500, private readonly now = () => Date.now()) {}
  async get(key: string) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp < this.now()) { this.map.delete(key); return undefined; }
    this.map.delete(key); this.map.set(key, e); // récence
    return e.v;
  }
  async set(key: string, v: string, ttlSeconds: number) {
    this.map.set(key, { v, exp: this.now() + ttlSeconds * 1000 });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "HttpError"; }
}

export interface HttpOptions {
  fetchImpl?: typeof fetch;
  cache?: Cache;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  /** Espacement minimal entre deux appels au même hôte (ms), ex. Crossref 1000, PubMed 350. */
  minIntervalMs?: Readonly<Record<string, number>>;
  sleep?: (ms: number) => Promise<void>;
  /** Plafond d'attente sur Retry-After : au-delà, on abandonne plutôt que de bloquer le worker. */
  maxRetryAfterMs?: number;
}

export const DEFAULT_USER_AGENT = "podcast-app-research/0.1 (development)";

export class Http {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly lastCall = new Map<string, Promise<void>>();
  constructor(private readonly opts: HttpOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Réserve un créneau pour l'hôte (file d'attente par hôte, sans appel simultané). */
  private async slot(host: string): Promise<void> {
    const gap = this.opts.minIntervalMs?.[host] ?? 0;
    if (!gap) return;
    const prev = this.lastCall.get(host) ?? Promise.resolve();
    const mine = prev.then(() => this.sleep(gap));
    this.lastCall.set(host, mine.catch(() => {}));
    await prev;
  }

  async text(url: string, init: { accept?: string; cacheTtlSeconds?: number; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<string> {
    const ttl = init.cacheTtlSeconds ?? 86_400;
    const cached = ttl > 0 ? await this.opts.cache?.get(url) : undefined;
    if (cached !== undefined) return cached;
    const host = new URL(url).host;
    const retries = this.opts.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      await this.slot(host);
      const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 30_000);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: { "User-Agent": this.opts.userAgent ?? DEFAULT_USER_AGENT, Accept: init.accept ?? "application/json", ...init.headers },
          signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
        });
      } catch (e) {
        if (attempt < retries && !init.signal?.aborted) { await this.sleep(1000 * 2 ** attempt); continue; }
        throw e;
      }
      if (res.ok) {
        const body = await res.text();
        if (ttl > 0) await this.opts.cache?.set(url, body, ttl);
        return body;
      }
      const retryable = res.status === 429 || res.status >= 500;
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt;
      if (retryable && attempt < retries && wait <= (this.opts.maxRetryAfterMs ?? 30_000)) { await this.sleep(wait); continue; }
      throw new HttpError(res.status, `${host}_${res.status}`);
    }
  }

  async json<T>(url: string, init: Parameters<Http["text"]>[1] = {}): Promise<T> {
    return JSON.parse(await this.text(url, init)) as T;
  }
}
