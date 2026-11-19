import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Http } from "../src/index.js";

const dir = join(import.meta.dirname, "fixtures");
export const fixture = (name: string) => readFileSync(join(dir, name), "utf8");

/** Http qui sert les réponses réelles enregistrées le 19/11/2026, selon l'URL. */
export function fixtureHttp(): { http: Http; urls: string[] } {
  const urls: string[] = [];
  const routes: [RegExp, string][] = [
    [/ebi\.ac\.uk\/europepmc/, "europepmc.json"],
    [/esearch\.fcgi/, "pubmed-esearch.json"],
    [/esummary\.fcgi/, "pubmed-esummary.json"],
    [/efetch\.fcgi/, "pubmed-efetch.xml"],
    [/api\.crossref\.org/, "crossref.json"],
    [/archives-ouvertes\.fr/, "hal.json"],
    [/wikipedia\.org/, "wikipedia-fr.json"],
    [/wikidata\.org/, "wikidata.json"],
  ];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    return hit ? new Response(fixture(hit[1])) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { http: new Http({ fetchImpl }), urls };
}
