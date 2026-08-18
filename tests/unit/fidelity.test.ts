import { describe, expect, it } from "vitest";
import { detectUnsupportedAdditions, isDisproportionateExpansion } from "@/core/fidelity.js";

describe("fidelity checks", () => {
  it("detects common unsupported additions absent from the input", () => {
    const additions = detectUnsupportedAdditions(
      "je voudrais que me crée une landing page style apple en respectant les convention",
      "Crée une landing page avec un header, des témoignages, une FAQ, un footer et une palette détaillée.",
    );

    expect(additions).toEqual(
      expect.arrayContaining(["header", "testimonials", "faq", "footer", "color_palette"]),
    );
  });

  it("does not flag additions that were requested", () => {
    const additions = detectUnsupportedAdditions(
      "mets le formulaire en responsive",
      "Mets le formulaire en responsive en respectant les styles existants.",
    );

    expect(additions).not.toContain("responsive");
  });

  it("matches CTA only as an explicit lexical expression", () => {
    const additions = detectUnsupportedAdditions(
      "améliore le titre",
      "Améliore le titre pour le rendre plus clair et impactant, sans modifier son sens.",
    );

    expect(additions).not.toContain("CTA");
  });

  it("detects explicit CTA expressions", () => {
    const additions = detectUnsupportedAdditions(
      "améliore le titre",
      "Ajoute un bouton d'action et un appel à l'action visible.",
    );

    expect(additions).toContain("cta");
  });

  it("detects disproportionate expansion for very short inputs", () => {
    expect(
      isDisproportionateExpansion(
        "fais une landing page style apple",
        "Crée une landing page inspirée du style Apple. Ajoute un header, une section fonctionnalités, une section témoignages, une FAQ, un footer, une palette détaillée, des animations, une stratégie SEO et des critères de performance.",
        "minimal",
      ),
    ).toBe(true);
  });

  it("does not treat a concise clarification of a tiny input as disproportionate", () => {
    expect(
      isDisproportionateExpansion(
        "corrige la page login",
        "Corrige le problème présent sur la page login, en respectant les conventions et l'implémentation existantes.",
      ),
    ).toBe(false);
  });

  it("allows more development in complete mode than in minimal mode", () => {
    const input = "réalise un plan d’architecture";
    const output = Array.from({ length: 60 }, () => "détail").join(" ");

    expect(isDisproportionateExpansion(input, output, "minimal")).toBe(true);
    expect(isDisproportionateExpansion(input, output, "complete")).toBe(false);
  });
});
