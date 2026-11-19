import { describe, expect, it } from "vitest";
import { WikipediaSearch } from "../src/index.js";

describe("WikipediaSearch", () => {
  it("interroge le Wikipédia de la langue demandée et renvoie titre, URL et introduction", async () => {
    let called = "";
    const fetchImpl = (async (url: string) => {
      called = url;
      return new Response(JSON.stringify({ query: { pages: [
        { title: "B", index: 2, fullurl: "https://fr.wikipedia.org/wiki/B", extract: "Texte B" },
        { title: "A", index: 1, fullurl: "https://fr.wikipedia.org/wiki/A", extract: "Texte A", touched: "2026-10-01T00:00:00Z" },
        { title: "Vide", index: 3, fullurl: "https://fr.wikipedia.org/wiki/Vide" },
      ] } }));
    }) as unknown as typeof fetch;
    const r = await new WikipediaSearch({ fetchImpl }).search("volcan", "fr-FR");
    expect(new URL(called).host).toBe("fr.wikipedia.org");
    expect(new URL(called).searchParams.get("gsrsearch")).toBe("volcan");
    expect(r.hits.map((h) => h.title)).toEqual(["A", "B"]);
    expect(r.hits[0]).toMatchObject({ snippet: "Texte A", publishedOn: "2026-10-01", locale: "fr-FR" });
    expect(r.usage[0]).toMatchObject({ category: "research", amountMicros: 0 });
  });

  it("refuse une langue invalide et remonte le statut HTTP", async () => {
    const fetchImpl = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(new WikipediaSearch({ fetchImpl }).search("x", "../evil")).rejects.toThrow("unsupported_locale");
    await expect(new WikipediaSearch({ fetchImpl }).search("x", "en-GB")).rejects.toMatchObject({ status: 429 });
  });
});
