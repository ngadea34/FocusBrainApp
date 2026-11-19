import { fenceUntrusted, type LlmProvider, type LlmRequest, type LlmResult } from "@app/pipeline";

/**
 * Modèle local via Ollama (décision D4 en dev, 19/11/2026 : Qwen3 8B sur le PC de Nico).
 * Coût nul : l'usage est quand même enregistré (jetons) pour comparer avec un modèle payant.
 * Le contenu non fiable (sujet, sources) est toujours délimité par fenceUntrusted.
 */
export interface OllamaOptions {
  /** Ex. http://127.0.0.1:11434 (Ollama sur la même machine que le worker). */
  baseUrl?: string;
  model?: string;
  /** Taille du contexte ; 8192 tient dans 8 Go de mémoire vidéo avec un modèle 8B quantifié. */
  numCtx?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OllamaLlm implements LlmProvider {
  readonly id = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OllamaOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.model = opts.model ?? "qwen3:8b";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResult> {
    const user = [
      ...req.untrusted.map((u) => fenceUntrusted(u.label, u.content)),
      req.instruction,
    ].join("\n\n");
    const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 10 * 60_000);
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false, // Qwen3 : pas de raisonnement visible, réponse directe
        ...(req.jsonSchema ? { format: req.jsonSchema } : {}),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: user },
        ],
        options: {
          num_predict: req.maxOutputTokens,
          num_ctx: this.opts.numCtx ?? 8192,
          temperature: this.opts.temperature ?? 0.4,
        },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      const err = new Error(`ollama_${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    const text = stripThinking(body.message?.content ?? "");
    if (!text) throw new Error("ollama_empty_response");
    return {
      text,
      usage: [
        { category: "llm", provider: this.id, model: this.model, units: body.prompt_eval_count ?? 0, unit: "tokens_in", amountMicros: 0 },
        { category: "llm", provider: this.id, model: this.model, units: body.eval_count ?? 0, unit: "tokens_out", amountMicros: 0 },
      ],
    };
  }
}

/** Retire un éventuel bloc <think>…</think> (certaines versions l'émettent malgré think:false). */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
