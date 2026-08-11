import { describe, expect, it } from "vitest";
import { describeInput, resolveSubmit } from "../../src/ui/prompt-input.js";
import { resolveShortcut } from "../../src/ui/shortcuts.js";

describe("resolveSubmit", () => {
  it("generates on a plain Enter", () => {
    expect(resolveSubmit("corrige ce texte")).toEqual({
      type: "generate",
      input: "corrige ce texte",
    });
  });

  it("continues the line when the prompt ends with a backslash", () => {
    expect(resolveSubmit("première ligne\\")).toEqual({
      type: "newline",
      input: "première ligne\n",
    });
  });

  it("never leaves the continuation mark in the prompt", () => {
    const outcome = resolveSubmit("garde ceci\\");
    expect(outcome.input).not.toContain("\\");
  });

  it("keeps a backslash that is not at the end", () => {
    expect(resolveSubmit("chemin C:\\Users et la suite").type).toBe("generate");
    expect(resolveSubmit("chemin C:\\Users et la suite").input).toContain("\\");
  });

  it("generates on an empty prompt, leaving the guard to the caller", () => {
    expect(resolveSubmit("").type).toBe("generate");
  });
});

describe("Ctrl+Enter is not advertised", () => {
  it("has no control binding for carriage return", () => {
    const context = {
      hasModal: false,
      hasResult: false,
      inputLength: 0,
      isGenerating: false,
    };
    expect(resolveShortcut("\r", { ctrl: true, escape: false }, context)).toBeNull();
  });
});

describe("describeInput", () => {
  it("reports an empty prompt", () => {
    expect(describeInput("")).toBe("0 lignes · 0 mots");
    expect(describeInput("   ")).toBe("0 lignes · 0 mots");
  });

  it("counts a single line and word", () => {
    expect(describeInput("bonjour")).toBe("1 ligne · 1 mot");
  });

  it("counts words on one line", () => {
    expect(describeInput("ajoute un bouton rouge")).toBe("1 ligne · 4 mots");
  });

  it("counts several lines", () => {
    expect(describeInput("première ligne\nseconde ligne")).toBe("2 lignes · 4 mots");
  });
});
