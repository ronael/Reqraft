import { describe, expect, it } from "vitest";
import { createTranslator } from "../../src/i18n/translate.js";

describe("typed translation catalogues", () => {
  it("translates parameterless and parameterized messages", () => {
    const en = createTranslator("en");
    const fr = createTranslator("fr");

    expect(en("common.error")).toBe("Error");
    expect(fr("common.error")).toBe("Erreur");
    expect(en("quality.unsupportedAdditions", { additions: "FAQ, pricing" })).toContain(
      "FAQ, pricing",
    );
    expect(fr("quality.unsupportedAdditions", { additions: "FAQ, tarifs" })).toContain(
      "FAQ, tarifs",
    );
  });
});
