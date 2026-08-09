import { describe, expect, it } from "vitest";
import {
  formatInitChoice,
  formatInitHeading,
  formatInitPrompt,
  formatInitStatus,
} from "../../src/ui/init-format.js";

const COLOR = { color: true, unicode: true } as const;

describe("init visual hierarchy", () => {
  it("gives the wizard an accented identity and a quiet subtitle", () => {
    expect(formatInitHeading("reqraft init", "Configuration guidée", COLOR)).toBe(
      "\u001b[1;38;2;167;139;250mreqraft init\u001b[0m\n\u001b[2mConfiguration guidée\u001b[0m\n\u001b[2m────────────────────────────────────────\u001b[0m",
    );
  });

  it("distinguishes the active choice without flattening inactive choices", () => {
    expect(formatInitChoice(0, "OpenAI", true, COLOR)).toContain(
      "\u001b[38;2;167;139;250m› 1. OpenAI\u001b[0m",
    );
    expect(formatInitChoice(1, "Anthropic", false, COLOR)).toContain(
      "  \u001b[2m2.\u001b[0m Anthropic",
    );
  });

  it("keeps defaults visible in prompts and reserves status colours", () => {
    expect(formatInitPrompt("Votre choix", "2", COLOR)).toContain(
      "Votre choix \u001b[2m(2)\u001b[0m : ",
    );
    expect(formatInitStatus("Clé détectée", "success", COLOR)).toContain(
      "\u001b[38;2;52;211;153m✓ Clé détectée\u001b[0m",
    );
  });

  it("remains readable without colour or Unicode", () => {
    expect(formatInitChoice(0, "OpenAI", true, { color: false, unicode: false })).toBe(
      "> 1. OpenAI",
    );
    expect(formatInitStatus("Clé absente", "warning", { color: false, unicode: false })).toBe(
      "! Clé absente",
    );
  });
});
