import { describe, expect, it } from "vitest";
import { previewRewritten } from "@/core/stream-preview.js";

/** Feeds a payload one character at a time, as a real stream would. */
function previewAtEveryStep(payload: string): ReturnType<typeof previewRewritten>[] {
  return Array.from({ length: payload.length }, (_, index) =>
    previewRewritten(payload.slice(0, index + 1)),
  );
}

describe("previewRewritten", () => {
  it("waits while the envelope has not reached the field", () => {
    expect(previewRewritten("")).toEqual({ kind: "pending" });
    expect(previewRewritten("{")).toEqual({ kind: "pending" });
    expect(previewRewritten('{"chang')).toEqual({ kind: "pending" });
    expect(previewRewritten('{"rewritten"')).toEqual({ kind: "pending" });
    expect(previewRewritten('{"rewritten":')).toEqual({ kind: "pending" });
  });

  it("reads the prose out as it arrives", () => {
    expect(previewRewritten('{"rewritten":"Bonjour')).toEqual({
      kind: "envelope",
      text: "Bonjour",
    });
  });

  it("decodes newline escapes instead of showing them literally", () => {
    expect(previewRewritten('{"rewritten":"Objectif :\\n\\n- Domaine')).toEqual({
      kind: "envelope",
      text: "Objectif :\n\n- Domaine",
    });
  });

  it("decodes quotes and backslashes", () => {
    expect(previewRewritten('{"rewritten":"dis \\"ok\\" et C:\\\\Users')).toEqual({
      kind: "envelope",
      text: 'dis "ok" et C:\\Users',
    });
  });

  it("decodes unicode escapes", () => {
    expect(previewRewritten('{"rewritten":"caf\\u00e9')).toEqual({
      kind: "envelope",
      text: "café",
    });
  });

  it("stops at the end of the field, ignoring the rest of the envelope", () => {
    expect(previewRewritten('{"rewritten":"Fini","changes":["a"],"warnings":[]}')).toEqual({
      kind: "envelope",
      text: "Fini",
    });
  });

  it("never emits a half-decoded escape at a chunk boundary", () => {
    for (const step of previewAtEveryStep('{"rewritten":"a\\nb\\u00e9c"}')) {
      if (step.kind === "envelope") {
        expect(step.text).not.toContain("\\");
        expect(step.text).not.toContain("u00");
      }
    }
  });

  it("only ever grows, so the panel never flickers backwards", () => {
    const lengths = previewAtEveryStep('{"rewritten":"une phrase assez longue"}').flatMap((step) =>
      step.kind === "envelope" ? [step.text.length] : [],
    );

    for (let index = 1; index < lengths.length; index++) {
      expect(lengths[index]).toBeGreaterThanOrEqual(lengths[index - 1] ?? 0);
    }
  });

  it("falls back to raw text when the provider ignored the JSON instruction", () => {
    expect(previewRewritten("Voici le prompt reformulé")).toEqual({
      kind: "prose",
      text: "Voici le prompt reformulé",
    });
  });

  it("treats a fenced envelope as an envelope, not as prose", () => {
    expect(previewRewritten('```json\n{"rewritten":"Salut')).toEqual({
      kind: "envelope",
      text: "Salut",
    });
  });

  it("waits rather than leaking JSON when the fields arrive out of order", () => {
    expect(previewRewritten('{"changes":["une correction"],"rewri')).toEqual({ kind: "pending" });
  });
});
