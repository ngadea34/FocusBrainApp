import { describe, expect, it } from "vitest";
import { aggregateVerdicts } from "../src/index.js";

const v = (status: "confirmed" | "nuanced" | "unverified" | "rejected", title = "S") => ({ status, tier: 3, title });

describe("vérification croisée (brief §4)", () => {
  it("confirmation seule → confirmée", () => expect(aggregateVerdicts([v("confirmed"), v("unverified")]).status).toBe("confirmed"));
  it("contradiction seule → rejetée", () => expect(aggregateVerdicts([v("rejected"), v("unverified")]).status).toBe("rejected"));
  it("désaccord entre sources → nuancée, contradiction signalée", () => {
    const r = aggregateVerdicts([v("confirmed", "A."), v("rejected", "B.")]);
    expect(r).toMatchObject({ status: "nuanced", contradiction: true });
    expect(r.rationale).toBe("Sources en désaccord. Pour : A. Contre : B.");
  });
  it("aucune source n'en parle → non vérifiée (preuve insuffisante)", () => expect(aggregateVerdicts([v("unverified"), v("unverified")]).status).toBe("unverified"));
  it("aucune source lisible → non vérifiée, avec la raison", () => expect(aggregateVerdicts([]).rationale).toContain("licence"));
});
