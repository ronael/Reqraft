import { describe, expect, it } from "vitest";
import { DESKTOP_MESSAGES, formatMessage } from "@/i18n/desktop/index.js";
import { resolveUiLocale } from "@/i18n/locale.js";

/**
 * Le catalogue de l'interface desktop.
 *
 * Il double celui du CLI parce qu'il traverse l'IPC — des chaînes se
 * sérialisent, des fonctions non. Ce qui doit être vérifié est donc la seule
 * chose que la duplication met en danger : que les deux langues restent
 * alignées.
 */

describe("catalogue desktop", () => {
  it("a exactement les mêmes clés dans les deux langues", () => {
    // Une clé oubliée en français afficherait la clé brute à l'écran, sans que
    // rien n'échoue au build.
    const en = Object.keys(DESKTOP_MESSAGES.en).sort((a, b) => a.localeCompare(b));
    const fr = Object.keys(DESKTOP_MESSAGES.fr).sort((a, b) => a.localeCompare(b));

    expect(fr).toEqual(en);
  });

  it("ne laisse aucune traduction vide", () => {
    for (const [locale, messages] of Object.entries(DESKTOP_MESSAGES)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim(), `${locale}/${key} est vide`).not.toBe("");
      }
    }
  });

  it("garde les mêmes paramètres d'une langue à l'autre", () => {
    // `{profile}` traduit en `{profil}` ne serait jamais remplacé, et le
    // gabarit s'afficherait tel quel.
    const parametres = (value: string): string[] =>
      [...value.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1] ?? "")
        .sort((a, b) => a.localeCompare(b));

    for (const key of Object.keys(DESKTOP_MESSAGES.en)) {
      expect(
        parametres(DESKTOP_MESSAGES.fr[key] ?? ""),
        `paramètres divergents pour ${key}`,
      ).toEqual(parametres(DESKTOP_MESSAGES.en[key] ?? ""));
    }
  });
});

describe("formatMessage", () => {
  it("remplace les paramètres nommés", () => {
    expect(formatMessage("selection · {app}", { app: "Mail" })).toBe("selection · Mail");
  });

  it("laisse le gabarit visible quand un paramètre manque", () => {
    // Mieux qu'un trou : on voit ce qui n'a pas été fourni.
    expect(formatMessage("selection · {app}")).toBe("selection · {app}");
  });
});

describe("la langue par défaut", () => {
  it("est l'anglais quand rien n'est demandé", () => {
    // Le desktop suit la règle du CLI : « fr » était codé en dur dans le
    // service de reformulation et s'imposait à tout le monde.
    expect(resolveUiLocale({ systemLocales: [] })).toBe("en");
  });

  it("suit la langue du système", () => {
    expect(resolveUiLocale({ systemLocales: ["fr_FR.UTF-8"] })).toBe("fr");
  });

  it("laisse la configuration l'emporter sur le système", () => {
    expect(resolveUiLocale({ config: "en", systemLocales: ["fr_FR.UTF-8"] })).toBe("en");
  });
});
