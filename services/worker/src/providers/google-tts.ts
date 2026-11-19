import { primaryLanguage } from "@app/contracts";
import { toMicros, type TtsProvider, type TtsRequest, type TtsResult } from "@app/pipeline";

/**
 * Google Cloud Text-to-Speech, voix Chirp 3 HD (décision D3, 19/11/2026).
 * Débit : toujours 1.0. Le réglage « rapide/lent » agit sur la longueur du
 * script et sur la vitesse du lecteur, pas sur la synthèse (test d'écoute).
 */
export interface GoogleTtsOptions {
  /** Clé API. Absente en session cloud : le proxy ajoute l'en-tête X-Goog-Api-Key. */
  apiKey?: string;
  /** Prix public par million de caractères (USD) — à mettre à jour si le tarif change. */
  usdPerMillionChars?: number;
  voices?: Readonly<Record<string, string>>;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

export const CHIRP3_HD_VOICES: Readonly<Record<string, string>> = {
  "fr-FR": "fr-FR-Chirp3-HD-Aoede",
  "en-GB": "en-GB-Chirp3-HD-Aoede",
  "en-US": "en-US-Chirp3-HD-Aoede",
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export class GoogleChirpTts implements TtsProvider {
  readonly id = "google-tts";
  private readonly price: number;
  private readonly voices: Readonly<Record<string, string>>;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(private readonly opts: GoogleTtsOptions = {}) {
    this.price = opts.usdPerMillionChars ?? 30;
    this.voices = opts.voices ?? CHIRP3_HD_VOICES;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.endpoint = opts.endpoint ?? "https://texttospeech.googleapis.com/v1/text:synthesize";
  }

  voiceFor(locale: string): string {
    const exact = this.voices[locale];
    if (exact) return exact;
    const lang = primaryLanguage(locale);
    const fallback = Object.entries(this.voices).find(([l]) => primaryLanguage(l) === lang);
    if (!fallback) throw new Error(`voice_unavailable:${locale}`);
    return fallback[1];
  }

  async synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult> {
    const text = applyLexicon(req.text, req.lexicon);
    // Limite de l'API : 5 000 octets par requête.
    if (new TextEncoder().encode(text).length > 5000) throw new Error("segment_too_long");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.opts.apiKey) headers["X-Goog-Api-Key"] = this.opts.apiKey;
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: req.locale, name: req.voiceId },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new HttpError(res.status, `google_tts_${res.status}`);
    const body = (await res.json()) as { audioContent?: string };
    if (!body.audioContent) throw new Error("google_tts_empty_audio");
    const audio = Uint8Array.from(Buffer.from(body.audioContent, "base64"));
    const characters = [...text].length;
    return {
      audio,
      mimeType: "audio/mpeg",
      durationMs: estimateMp3DurationMs(audio),
      usage: [{
        category: "tts", provider: this.id, model: req.voiceId, units: characters, unit: "characters",
        amountMicros: toMicros((characters * this.price) / 1_000_000),
      }],
    };
  }
}

/** Remplace les termes du lexique (prononciation) par leur transcription, mot entier. */
export function applyLexicon(text: string, lexicon?: Readonly<Record<string, string>>): string {
  if (!lexicon) return text;
  let out = text;
  for (const [term, say] of Object.entries(lexicon)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"), say);
  }
  return out;
}

/** Durée d'un MP3 CBR à partir de l'en-tête de la première trame (estimation, recalculée à l'assemblage). */
export function estimateMp3DurationMs(bytes: Uint8Array): number {
  const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]; // MPEG1 Layer III
  const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]; // MPEG2/2.5 Layer III
  let i = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    i = 10 + size;
  }
  for (; i + 4 < bytes.length; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1]! & 0xe0) === 0xe0) {
      const version = (bytes[i + 1]! >> 3) & 0x03; // 3 = MPEG1
      const idx = (bytes[i + 2]! >> 4) & 0x0f;
      const kbps = (version === 3 ? BITRATES : BITRATES_V2)[idx];
      if (!kbps) continue;
      return Math.round(((bytes.length - i) * 8) / kbps);
    }
  }
  return 0;
}
