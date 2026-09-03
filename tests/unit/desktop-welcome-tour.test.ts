import { describe, expect, it } from "vitest";
import {
  shouldShowWelcomeTour,
  WELCOME_TOUR_AI_BRANDS,
  WELCOME_TOUR_CAPSULE_KEYS,
  WELCOME_TOUR_PROFILE_IDS,
  WELCOME_TOUR_PROVIDERS,
  WELCOME_TOUR_SLIDES,
} from "@/apps/desktop/renderer/onboarding/WelcomeTour.js";
import { CAPSULE_COMPARE_KEY } from "@/apps/desktop/renderer/shared/shortcut-labels.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import { PROVIDER_DEFINITIONS } from "@/providers/catalog.js";

describe("welcome tour desktop", () => {
  it("apparaît une fois, y compris sur une installation déjà configurée", () => {
    expect(shouldShowWelcomeTour(true, false)).toBe(true);
    expect(shouldShowWelcomeTour(false, false)).toBe(false);
    expect(shouldShowWelcomeTour(false, false, true)).toBe(true);
  });

  it("reste masqué après le passage vers la configuration", () => {
    expect(shouldShowWelcomeTour(true, true)).toBe(false);
    expect(shouldShowWelcomeTour(false, true, true)).toBe(false);
  });

  it("présente six cas d'usage traduits et distincts", () => {
    expect(WELCOME_TOUR_SLIDES).toHaveLength(6);
    expect(new Set(WELCOME_TOUR_SLIDES.map(({ visual }) => visual)).size).toBe(6);
    expect(WELCOME_TOUR_SLIDES.map(({ visual }) => visual)).toEqual([
      "mail",
      "chat",
      "code",
      "profiles",
      "providers",
      "privacy",
    ]);

    const interactionKeys = [
      "onboarding.tour.replay",
      "onboarding.tour.mail.rewritten",
      "onboarding.tour.chat.workspace",
      "onboarding.tour.chat.recent",
      "onboarding.tour.chat.availableModels",
      "onboarding.tour.chat.placeholder",
      "onboarding.tour.chat.rewritten",
      "onboarding.tour.code.rewritten",
      "onboarding.tour.profiles.add",
      "onboarding.tour.providers.compatible",
      "onboarding.tour.privacy.example",
      "onboarding.tour.privacy.telemetry",
    ] as const;

    for (const locale of ["fr", "en"] as const) {
      const t = createDesktopTranslator(locale);
      for (const slide of WELCOME_TOUR_SLIDES) {
        expect(t(slide.title)).not.toBe(slide.title);
        expect(t(slide.body)).not.toBe(slide.body);
      }
      for (const key of interactionKeys) {
        expect(t(key)).not.toBe(key);
      }
    }
  });

  it("rejoue le pied de la capsule avec les touches que la capsule annonce", () => {
    // La maquette a déjà dérivé : elle montrait `⌥` alors que le pied réel
    // était passé à `⌘D`. C'est la première, et parfois la seule, fois qu'on
    // lit ces touches — la touche de comparaison vient donc de la même
    // constante que le pied.
    const compare = WELCOME_TOUR_CAPSULE_KEYS.find(({ label }) => label === "capsule.compare");
    expect(compare?.touche).toBe(CAPSULE_COMPARE_KEY);

    for (const locale of ["fr", "en"] as const) {
      const t = createDesktopTranslator(locale);
      for (const { label } of WELCOME_TOUR_CAPSULE_KEYS) {
        expect(t(label), `${locale}/${label}`).not.toBe(label);
      }
    }
  });

  it("ne cite que des profils et providers réellement disponibles", () => {
    const profileIds = new Set([AUTO_PROFILE_ID, ...BUILTIN_PROFILE_IDS]);
    for (const profileId of WELCOME_TOUR_PROFILE_IDS) {
      expect(profileIds.has(profileId)).toBe(true);
    }

    const providers = new Map(PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]));
    for (const tourProvider of WELCOME_TOUR_PROVIDERS) {
      const provider = providers.get(tourProvider.id);
      expect(provider?.label).toBe(tourProvider.name);
      expect(provider?.visibleInInit).toBe(true);
      expect(provider?.isTest).toBe(false);
    }
  });

  it("présente les principaux écosystèmes IA avec un asset distinct", () => {
    expect(WELCOME_TOUR_AI_BRANDS.map(({ name }) => name)).toEqual([
      "ChatGPT",
      "Claude",
      "DeepSeek",
      "Kimi",
    ]);
    expect(new Set(WELCOME_TOUR_AI_BRANDS.map(({ logo }) => logo)).size).toBe(4);
  });
});
