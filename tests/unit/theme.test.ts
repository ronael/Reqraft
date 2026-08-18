import { describe, expect, it } from "vitest";
import { detectColor, detectUnicode } from "@/apps/cli/ui/theme/capabilities.js";
import { getPalette } from "@/apps/cli/ui/theme/palette.js";
import { getSymbols } from "@/apps/cli/ui/theme/symbols.js";
import { createTheme } from "@/apps/cli/ui/theme/tokens.js";

describe("colour detection", () => {
  it("colours a plain TTY", () => {
    expect(detectColor({}, true)).toBe(true);
  });

  it("never colours a pipe, so redirected output stays clean", () => {
    expect(detectColor({}, false)).toBe(false);
  });

  it("honours NO_COLOR whatever its value, including empty", () => {
    expect(detectColor({ NO_COLOR: "1" }, true)).toBe(false);
    expect(detectColor({ NO_COLOR: "" }, true)).toBe(false);
  });

  it("stays monochrome on a dumb terminal", () => {
    expect(detectColor({ TERM: "dumb" }, true)).toBe(false);
  });
});

describe("unicode detection", () => {
  it.each(["en_US.UTF-8", "fr_FR.utf8", "C.UTF-8"])("trusts the %s locale", (locale) => {
    expect(detectUnicode({ LANG: locale }, "darwin")).toBe(true);
  });

  it("falls back to ASCII without a UTF-8 locale", () => {
    expect(detectUnicode({ LANG: "C" }, "linux")).toBe(false);
    expect(detectUnicode({}, "linux")).toBe(false);
  });

  it("prefers the most specific locale variable", () => {
    expect(detectUnicode({ LC_ALL: "C", LANG: "en_US.UTF-8" }, "linux")).toBe(false);
    expect(detectUnicode({ LC_CTYPE: "en_US.UTF-8", LANG: "C" }, "linux")).toBe(true);
  });

  it("distrusts the legacy Windows console but accepts Windows Terminal", () => {
    expect(detectUnicode({ LANG: "en_US.UTF-8" }, "win32")).toBe(false);
    expect(detectUnicode({ WT_SESSION: "abc" }, "win32")).toBe(true);
  });

  it("falls back to ASCII on a dumb terminal", () => {
    expect(detectUnicode({ TERM: "dumb", LANG: "en_US.UTF-8" }, "linux")).toBe(false);
  });
});

describe("palette", () => {
  it("never forces a foreground, so light themes stay readable", () => {
    expect(getPalette(true).text).toBeUndefined();
  });

  it("drops every colour when colour is unavailable", () => {
    expect(Object.values(getPalette(false)).every((value) => value === undefined)).toBe(true);
  });

  it("uses the violet accent from the reference mockup", () => {
    expect(getPalette(true).accent).toBe("#a78bfa");
  });
});

describe("symbols", () => {
  it("gives every status a glyph, so colour is never the only signal", () => {
    const symbols = getSymbols(true);
    expect(symbols.success).not.toBe(symbols.danger);
    expect(symbols.success).not.toBe(symbols.warning);
  });

  it("keeps the ASCII set free of non-ASCII characters", () => {
    for (const glyph of Object.values(getSymbols(false))) {
      expect(glyph).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it("keeps meanings distinct in the ASCII set too", () => {
    const ascii = getSymbols(false);
    expect(new Set(Object.values(ascii)).size).toBeGreaterThan(5);
  });
});

describe("createTheme", () => {
  it("falls back to ASCII borders when Unicode is unreliable", () => {
    const theme = createTheme({ color: true, unicode: false });
    expect(theme.border).toEqual({ primary: "classic", secondary: "classic" });
  });

  it("uses drawn borders when Unicode is available", () => {
    const theme = createTheme({ color: true, unicode: true });
    expect(theme.border).toEqual({ primary: "round", secondary: "single" });
  });

  it("keeps symbols even with colour disabled", () => {
    const theme = createTheme({ color: false, unicode: true });
    expect(theme.color.danger).toBeUndefined();
    expect(theme.symbol.danger).toBe("×");
  });
});
