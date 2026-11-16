import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";

/**
 * Where `auto` picks the profile, as each surface tells it.
 *
 * `auto` was once a keyword matcher run on the machine. It is now the model,
 * in the same request as the rewrite (docs/profiles.md), but the site, the
 * desktop catalogue and the French README still said "locally, before any
 * network call" — a privacy claim nothing backs any more.
 */

const read = (file: string): string => readFileSync(path.join(process.cwd(), file), "utf8");

/** Mentions of a local decision, in English or French. */
const LOCAL = /local|on your machine|before any network call|avant tout appel/i;

describe("auto profile wording", () => {
  it("the site's profiles section does not say auto decides on the machine", () => {
    const { document } = new JSDOM(read("index.html")).window;
    const section = document.querySelector("#profiles");

    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("auto");
    expect(section?.textContent).not.toMatch(LOCAL);
  });

  it("the site's capsule shows the picked profile with the result, not a local detection", () => {
    const page = read("index.html");

    expect(page).not.toMatch(/detected locally|local analysis/i);
    expect(page).toContain("detected automatically");
  });

  it.each(Object.entries(DESKTOP_MESSAGES))(
    "the desktop describes auto as the model's choice (%s)",
    (_locale, messages) => {
      expect(messages["main.autoProfileSummary"]).not.toMatch(LOCAL);
      expect(messages["main.autoProfileDescription"]).not.toMatch(LOCAL);
    },
  );

  it("the French README describes auto as the model's choice", () => {
    const line = read("docs/fr/README.md")
      .split("\n")
      .find((candidate) => candidate.startsWith("- `auto`"));

    expect(line).toBeDefined();
    expect(line).not.toMatch(LOCAL);
    expect(line).toMatch(/modèle/);
  });
});
