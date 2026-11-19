import { describe, expect, it } from "vitest";
import { applyLexicon, estimateMp3DurationMs, GoogleChirpTts, HttpError } from "../src/index.js";

// Trame MPEG1 Layer III, 64 kbit/s (index 5), 44,1 kHz : en-tête FF FB 50 00
function fakeMp3(bytes: number): Uint8Array {
  const b = new Uint8Array(bytes);
  b.set([0xff, 0xfb, 0x50, 0x00]);
  return b;
}

function stubFetch(status: number, body: unknown, seen: unknown[] = []): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("GoogleChirpTts", () => {
  it("synthétise à débit 1.0 avec la voix Chirp 3 HD et mesure le coût", async () => {
    const seen: any[] = [];
    const audio = Buffer.from(fakeMp3(8000)).toString("base64");
    const tts = new GoogleChirpTts({ fetchImpl: stubFetch(200, { audioContent: audio }, seen) });
    const voice = tts.voiceFor("fr-FR");
    expect(voice).toBe("fr-FR-Chirp3-HD-Aoede");
    const r = await tts.synthesize({ text: "Bonjour à tous.", locale: "fr-FR", voiceId: voice, speechRate: "fast" });
    expect(seen[0].audioConfig.speakingRate).toBe(1);
    expect(seen[0].voice.name).toBe(voice);
    expect(r.usage[0]).toMatchObject({ category: "tts", units: 15, unit: "characters", amountMicros: 450 });
    expect(r.durationMs).toBe(1000);
  });
  it("retombe sur une voix de la même langue", () => {
    expect(new GoogleChirpTts().voiceFor("fr-CA")).toBe("fr-FR-Chirp3-HD-Aoede");
    expect(() => new GoogleChirpTts().voiceFor("ja-JP")).toThrow("voice_unavailable");
  });
  it("propage le statut HTTP pour la décision de retry", async () => {
    const tts = new GoogleChirpTts({ fetchImpl: stubFetch(503, {}) });
    await expect(tts.synthesize({ text: "x", locale: "fr-FR", voiceId: "v", speechRate: "moderate" }))
      .rejects.toMatchObject({ status: 503 } satisfies Partial<HttpError>);
  });
  it("refuse un segment au-delà de 5 000 octets", async () => {
    const tts = new GoogleChirpTts({ fetchImpl: stubFetch(200, {}) });
    await expect(tts.synthesize({ text: "é".repeat(2600), locale: "fr-FR", voiceId: "v", speechRate: "moderate" }))
      .rejects.toThrow("segment_too_long");
  });
});

describe("lexique de prononciation", () => {
  it("remplace les mots entiers seulement", () => {
    expect(applyLexicon("L'ADN et l'ADNc.", { ADN: "a dé ènne" })).toBe("L'a dé ènne et l'ADNc.");
  });
});

describe("durée MP3", () => {
  it("ignore l'en-tête ID3", () => {
    const id3 = new Uint8Array(20); id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10]);
    const all = new Uint8Array(20 + 8000); all.set(id3); all.set(fakeMp3(8000), 20);
    expect(estimateMp3DurationMs(all)).toBe(1000);
  });
});
