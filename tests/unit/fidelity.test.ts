import { describe, expect, it } from "vitest";
import { detectUnsupportedAdditions, isDisproportionateExpansion } from "../../src/core/fidelity.js";

describe("fidelity checks", () => {
  it("detects common unsupported additions absent from the input", () => {
    const additions = detectUnsupportedAdditions(
      "je voudrais que me crée une landing page style apple en respectant les convention",
      "Crée une landing page avec un header, des témoignages, une FAQ, un footer et une palette détaillée.",
    );

    expect(additions).toEqual(expect.arrayContaining(["header", "témoignages", "FAQ", "footer", "palette détaillée"]));
  });

  it("does not flag additions that were requested", () => {
    const additions = detectUnsupportedAdditions(
      "mets le formulaire en responsive",
      "Mets le formulaire en responsive en respectant les styles existants.",
    );

    expect(additions).not.toContain("responsive");
  });

  it("detects disproportionate expansion for very short inputs", () => {
    expect(
      isDisproportionateExpansion(
        "fais une landing page style apple",
        "Crée une landing page inspirée du style Apple. Ajoute un header, une section fonctionnalités, une section témoignages, une FAQ, un footer, une palette détaillée, des animations, une stratégie SEO et des critères de performance.",
      ),
    ).toBe(true);
  });
});
