import { expect, it } from "vitest";
import { describeQualityVerdict } from "@/apps/desktop/renderer/shared/quality.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";
import type { RepromptResult } from "@/core/types.js";

const t = createDesktopTranslator("fr");
const result: RepromptResult = {
  original: "ema conv :",
  rewritten: "ema conv :",
  profile: "clean",
  level: "minimal",
  provider: "mock",
  model: "mock-model",
  changes: [],
  quality: { status: "good", signals: [] },
};

it("states that an exactly unchanged text was preserved without promising semantic fidelity", () => {
  expect(describeQualityVerdict(result, result.rewritten, t).label).toBe("✓ texte conservé");
  const changed = { ...result, rewritten: "Ema conv :" };
  expect(describeQualityVerdict(changed, changed.rewritten, t).label).toBe("✓ aucune alerte");
});

it("does not apply the original verdict to a manually edited result", () => {
  const verdict = describeQualityVerdict(result, "manually changed", t);
  expect(verdict.label).toBe("modifié · à relire");
  expect(verdict.tone).toBe("review");
});

it("never hides a warning behind the preserved text label", () => {
  const warning: RepromptResult = {
    ...result,
    quality: { status: "review", signals: [{ code: "rewrite_instruction", severity: "warning" }] },
  };
  expect(describeQualityVerdict(warning, warning.rewritten, t).label).toBe("! consigne ajoutée");
});

it("does not claim no alerts when permissive mode has informative signals", () => {
  const informative: RepromptResult = {
    ...result,
    quality: { status: "good", signals: [{ code: "rewrite_instruction", severity: "info" }] },
  };
  expect(describeQualityVerdict(informative, informative.rewritten, t).label).toBe(
    "signaux informatifs",
  );
});
