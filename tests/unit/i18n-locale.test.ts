import { describe, expect, it } from "vitest";
import {
  findUiLocalePreference,
  normalizeSystemLocale,
  resolveUiLocale,
} from "../../src/i18n/locale.js";

describe("UI locale resolution", () => {
  it.each([
    ["fr", "fr"],
    ["fr_FR.UTF-8", "fr"],
    ["fr-FR", "fr"],
    ["fr_CA@euro", "fr"],
    ["en_US", "en"],
    ["en_US.UTF-8", "en"],
    ["en-GB", "en"],
    ["C", undefined],
    ["POSIX", undefined],
    ["de_DE.UTF-8", undefined],
    ["not a locale", undefined],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeSystemLocale(input)).toBe(expected);
  });

  it("honours CLI, config, env and system precedence", () => {
    expect(
      resolveUiLocale({
        cli: "fr",
        config: "en",
        env: "en",
        systemLocales: ["en_US.UTF-8"],
      }),
    ).toBe("fr");
    expect(
      resolveUiLocale({
        cli: "auto",
        config: "fr",
        env: "en",
        systemLocales: ["en_US.UTF-8"],
      }),
    ).toBe("fr");
    expect(
      resolveUiLocale({
        config: "auto",
        env: "fr",
        systemLocales: ["en_US.UTF-8"],
      }),
    ).toBe("fr");
    expect(resolveUiLocale({ systemLocales: ["fr_FR.UTF-8"] })).toBe("fr");
    expect(resolveUiLocale({ systemLocales: ["de_DE.UTF-8"] })).toBe("en");
  });

  it("rejects unsupported explicit Reqraft preferences", () => {
    expect(() => resolveUiLocale({ cli: "de" })).toThrow("uiLocale");
    expect(() => resolveUiLocale({ env: "fr_FR" })).toThrow("uiLocale");
  });

  it("finds both root option syntaxes without consuming argv", () => {
    expect(findUiLocalePreference(["node", "rp", "--ui-locale", "fr", "doctor"])).toBe("fr");
    expect(findUiLocalePreference(["node", "rp", "--ui-locale=en", "doctor"])).toBe("en");
    expect(findUiLocalePreference(["node", "rp", "doctor"])).toBeUndefined();
  });
});
