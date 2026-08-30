import { describe, expect, it } from "vitest";
import {
  shouldShowWelcomeTour,
  WELCOME_TOUR_SLIDES,
} from "@/apps/desktop/renderer/onboarding/WelcomeTour.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

describe("welcome tour desktop", () => {
  it("n'apparaît que lorsqu'aucune configuration n'existe", () => {
    expect(shouldShowWelcomeTour("config_missing", false)).toBe(true);
    expect(shouldShowWelcomeTour("provider_incomplete", false)).toBe(false);
    expect(shouldShowWelcomeTour("credential_missing", false)).toBe(false);
    expect(shouldShowWelcomeTour(undefined, false)).toBe(false);
  });

  it("reste masqué après le passage vers la configuration", () => {
    expect(shouldShowWelcomeTour("config_missing", true)).toBe(false);
  });

  it("présente trois écrans traduits et distincts", () => {
    expect(WELCOME_TOUR_SLIDES).toHaveLength(3);
    expect(new Set(WELCOME_TOUR_SLIDES.map(({ visual }) => visual)).size).toBe(3);

    for (const locale of ["fr", "en"] as const) {
      const t = createDesktopTranslator(locale);
      for (const slide of WELCOME_TOUR_SLIDES) {
        expect(t(slide.title)).not.toBe(slide.title);
        expect(t(slide.body)).not.toBe(slide.body);
      }
    }
  });
});
