/**
 * Lien d'écoute (URL signée) sur un vrai projet Supabase.
 * Crée deux utilisateurs jetables, dépose un fichier dans le dossier de A,
 * vérifie les droits et l'expiration, puis supprime tout.
 * Variables : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (jamais commitées).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_ = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET = "episode-audio";

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const asUser = (jwt: string) => ({ apikey: ANON, Authorization: `Bearer ${jwt}` });

async function createUser(): Promise<{ id: string; jwt: string }> {
  const email = `test-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const r = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST", headers: { ...svc, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`create_user ${r.status} ${await r.text()}`);
  const { id } = (await r.json()) as { id: string };
  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  if (!t.ok) throw new Error(`token ${t.status} ${await t.text()}`);
  return { id, jwt: ((await t.json()) as { access_token: string }).access_token };
}

async function sign(jwt: string, path: string, expiresIn: number): Promise<Response> {
  return fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST", headers: { ...asUser(jwt), "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn }),
  });
}

let a: { id: string; jwt: string };
let b: { id: string; jwt: string };
let path: string;

beforeAll(async () => {
  a = await createUser();
  b = await createUser();
  path = `${a.id}/${randomUUID()}/episode.mp3`;
  const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", headers: { ...svc, "Content-Type": "audio/mpeg" }, body: new Uint8Array([0xff, 0xfb, 0x50, 0x00]),
  });
  if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
});

afterAll(async () => {
  await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
    method: "DELETE", headers: { ...svc, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }),
  }).catch(() => {});
  for (const u of [a, b]) if (u) await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: svc }).catch(() => {});
});

describe("lien d'écoute signé (projet réel)", () => {
  it("le propriétaire obtient un lien qui permet d'écouter", async () => {
    const r = await sign(a.jwt, path, 60);
    expect(r.status).toBe(200);
    const { signedURL } = (await r.json()) as { signedURL: string };
    const audio = await fetch(`${URL_}/storage/v1${signedURL}`);
    expect(audio.status).toBe(200);
    expect(new Uint8Array(await audio.arrayBuffer())[0]).toBe(0xff);
  });

  it("un autre utilisateur ne peut pas obtenir de lien", async () => {
    const r = await sign(b.jwt, path, 60);
    expect(r.ok).toBe(false);
  });

  it("un visiteur anonyme ne peut ni signer ni lire directement", async () => {
    const r = await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }),
    });
    expect(r.ok).toBe(false);
    const direct = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(direct.ok).toBe(false);
  });

  it("le lien expire", async () => {
    const r = await sign(a.jwt, path, 1);
    const { signedURL } = (await r.json()) as { signedURL: string };
    await new Promise((res) => setTimeout(res, 2500));
    const audio = await fetch(`${URL_}/storage/v1${signedURL}`);
    expect(audio.ok).toBe(false);
  });
});
