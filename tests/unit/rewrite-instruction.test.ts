import { describe, expect, it } from "vitest";
import { assessFidelity } from "@/core/fidelity.js";
import { rewrite } from "@/core/engine.js";
import { cleanProfile } from "@/profiles/clean.js";
import { describeQualitySignal } from "@/apps/cli/ui/quality.js";
import { createTranslator } from "@/i18n/translate.js";
import { FIDELITY_BENCHMARK_CASES } from "../../benchmark/fidelity-cases.js";

// Sortie réelle remontée dans la capsule (clean détecté, standard, GPT-5.1).
const INPUT = "ema conv :";
const WRAPPED =
  'Clarifie et reformule la demande suivante, en corrigeant l’orthographe et la grammaire sans en modifier le sens :\n\n"ema conv :"';

describe("a rewrite instruction wrapped around unchanged source text", () => {
  it("explains the finding in the CLI in both languages", () => {
    const signal = { code: "rewrite_instruction", severity: "warning" } as const;
    expect(describeQualitySignal(signal, createTranslator("fr"))).toContain(
      "demande de reformuler",
    );
    expect(describeQualitySignal(signal, createTranslator("en"))).toContain("asks for a rewrite");
  });

  it.each(["minimal", "standard", "complete"] as const)(
    "requires review at level %s even when word-count checks allow it",
    (level) => {
      const quality = assessFidelity(INPUT, WRAPPED, "balanced", level);
      expect(quality.status).toBe("review");
      expect(quality.signals).toContainEqual({ code: "rewrite_instruction", severity: "warning" });
    },
  );

  it.each([
    ["bonjour paul", "Corrige le texte suivant : « bonjour paul »"],
    ["hello sam", 'Please rewrite the following message: "hello sam".'],
    ["see you soon", "Rephrase the following text:\n```\nsee you soon\n```"],
  ])("detects a wrapper around %s", (input, output) => {
    expect(assessFidelity(input, output, "balanced", "standard").signals).toContainEqual({
      code: "rewrite_instruction",
      severity: "warning",
    });
  });

  it.each([
    [INPUT, "Ema conv :"],
    ["bonjour paul", "Bonjour Paul."],
    ["corrige ce message : bonjour paul", 'Corrige le message suivant : "bonjour paul"'],
    ["reformule ceci", 'Reformule le texte suivant : "reformule ceci"'],
    ["make this clearer", 'Rewrite the following request: "make this clearer"'],
    ["Écris une consigne pour corriger le texte", "Corrige le texte suivant."],
    ["bonjour", "Corrige le titre : bonjour et bienvenue"],
    ["", "Reformule le texte suivant :"],
  ])("does not flag direct corrections or requested editing: %s", (input, output) => {
    expect(
      assessFidelity(input, output, "balanced", "standard").signals.map(({ code }) => code),
    ).not.toContain("rewrite_instruction");
  });

  it("stays silent when the benchmark inputs are preserved", () => {
    for (const entry of FIDELITY_BENCHMARK_CASES) {
      expect(
        assessFidelity(entry.input, entry.input, "balanced", entry.level).signals.map(
          ({ code }) => code,
        ),
        entry.id,
      ).not.toContain("rewrite_instruction");
    }
  });

  it("honours permissive mode without hiding the finding", () => {
    const quality = assessFidelity(INPUT, WRAPPED, "permissive", "standard");
    expect(quality.status).toBe("good");
    expect(quality.signals).toContainEqual({ code: "rewrite_instruction", severity: "info" });
  });

  it.each([cleanProfile, "auto"] as const)(
    "keeps the model response available but marks it for review (%s)",
    async (profile) => {
      const result = await rewrite({
        input: INPUT,
        profile,
        level: "standard",
        includeChanges: false,
        model: "fixture-model",
        provider: {
          id: "fixture",
          name: "Recorded response",
          generate: () =>
            Promise.resolve({
              text: JSON.stringify({ rewritten: WRAPPED, profile: "clean", warnings: [] }),
            }),
          validateConfiguration: () => Promise.resolve({ ok: true }),
        },
      });
      expect(result.rewritten).toBe(WRAPPED);
      expect(result.profile).toBe("clean");
      expect(result.quality.status).toBe("review");
    },
  );
});
