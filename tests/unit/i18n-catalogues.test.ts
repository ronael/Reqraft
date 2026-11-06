import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en.js";
import { fr } from "@/i18n/messages/fr.js";
import type { MessageCatalogue } from "@/i18n/translate.js";

/**
 * The CLI catalogues are functions, so TypeScript checks their keys and
 * parameter types but not what each translation does with its parameters.
 * Rendering every message catches the mistakes the types let through: a
 * parameter dropped from one language, or an interpolation that prints
 * `undefined`.
 */

type Message = (params: Record<string, string>) => string;

const CATALOGUES: Record<"en" | "fr", MessageCatalogue> = { en, fr };
const KEYS = Object.keys(en) as (keyof MessageCatalogue)[];

/** Renders a message with a marker for each parameter, and records which parameters it read. */
function render(message: MessageCatalogue[keyof MessageCatalogue]): {
  text: string;
  read: string[];
} {
  const read = new Set<string>();
  const params = new Proxy<Record<string, string>>(
    {},
    {
      get: (_target, name) => {
        const parameter = String(name);
        read.add(parameter);
        return `<${parameter}>`;
      },
    },
  );
  const text = (message as Message)(params);
  return { text, read: [...read].sort((a, b) => a.localeCompare(b)) };
}

describe("CLI message catalogues", () => {
  it.each(Object.entries(CATALOGUES))(
    "renders every %s message with each parameter it reads",
    (_locale, catalogue) => {
      for (const key of KEYS) {
        const { text, read } = render(catalogue[key]);

        expect(text.trim(), key).not.toBe("");
        expect(text, key).not.toMatch(/undefined|NaN|\[object /);
        for (const parameter of read) {
          expect(text, `${key} drops ${parameter}`).toContain(`<${parameter}>`);
        }
      }
    },
  );

  it("reads the same parameters in French as in English", () => {
    for (const key of KEYS) {
      expect(render(fr[key]).read, key).toEqual(render(en[key]).read);
    }
  });

  it("agrees line and word counts in number", () => {
    expect(en["input.linesWords"]({ lines: 1, words: 1 })).toBe("1 line · 1 word");
    expect(en["input.linesWords"]({ lines: 3, words: 12 })).toBe("3 lines · 12 words");
    expect(fr["input.linesWords"]({ lines: 1, words: 1 })).toBe("1 ligne · 1 mot");
    expect(fr["input.linesWords"]({ lines: 3, words: 12 })).toBe("3 lignes · 12 mots");
  });
});
