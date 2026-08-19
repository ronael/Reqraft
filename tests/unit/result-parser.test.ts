import { describe, expect, it } from "vitest";
import {
  parseResult,
  resolveDetectedProfileId,
  stripMarkdownFences,
} from "@/core/result-parser.js";

describe("stripMarkdownFences", () => {
  it("removes json fences", () => {
    const text = '```json\n{"rewritten":"hello"}\n```';
    expect(stripMarkdownFences(text)).toBe('{"rewritten":"hello"}');
  });

  it("keeps plain text", () => {
    expect(stripMarkdownFences("hello")).toBe("hello");
  });

  it("removes fences without a language tag", () => {
    expect(stripMarkdownFences('```\n{"rewritten":"hello"}\n```')).toBe('{"rewritten":"hello"}');
  });

  it("removes single-line fences", () => {
    expect(stripMarkdownFences('```{"a":1}```')).toBe('{"a":1}');
  });

  it("keeps an empty fence untouched", () => {
    expect(stripMarkdownFences("``````")).toBe("``````");
    expect(stripMarkdownFences("```   ```")).toBe("```   ```");
  });

  it("stays linear on an unterminated fence", () => {
    // The former regex combined `\s*\n?` with a lazy `[\s\S]*?` and an end
    // anchor, which backtracked quadratically. This input took seconds then.
    const payload = "```json" + "\n".repeat(6400) + "x```".repeat(64000) + "x";

    const start = performance.now();
    const result = stripMarkdownFences(payload);
    const elapsed = performance.now() - start;

    expect(result).toBe(payload);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("parseResult", () => {
  it("parses valid JSON", () => {
    const result = parseResult('{"rewritten":"Bonjour","changes":[],"warnings":[]}');
    expect(result.rewritten).toBe("Bonjour");
    expect(result.format).toBe("structured");
  });

  it("parses fenced JSON", () => {
    const result = parseResult('```json\n{"rewritten":"Salut","changes":["a"],"warnings":[]}\n```');
    expect(result.rewritten).toBe("Salut");
    expect(result.changes).toContain("a");
  });

  it("falls back on invalid JSON", () => {
    const result = parseResult("just some text");
    expect(result.rewritten).toBe("just some text");
    expect(result.format).toBe("raw");
    expect(result.modelWarnings).toEqual([]);
  });

  it("reads the profile field the auto prompt asks for", () => {
    const result = parseResult('{"rewritten":"Salut","profile":"frontend","warnings":[]}');
    expect(result.profile).toBe("frontend");
  });

  it("leaves profile undefined when the response omits it", () => {
    const result = parseResult('{"rewritten":"Salut","warnings":[]}');
    expect(result.profile).toBeUndefined();
  });
});

describe("resolveDetectedProfileId", () => {
  it("accepts any known built-in id, and reports no fallback", () => {
    for (const id of ["clean", "code", "frontend", "web-design", "debug", "review", "writing"]) {
      expect(resolveDetectedProfileId(id)).toEqual({ profileId: id, fellBack: false });
    }
  });

  it("falls back to the fixed default when the field is missing", () => {
    expect(resolveDetectedProfileId(undefined)).toEqual({ profileId: "clean", fellBack: true });
  });

  it("falls back to the fixed default on a hallucinated id, rather than trusting it", () => {
    expect(resolveDetectedProfileId("marketing")).toEqual({ profileId: "clean", fellBack: true });
  });
});

describe("parseResult on degenerate output", () => {
  it("keeps the answer when the model keeps talking after its JSON", () => {
    // Reproduces a real gpt-5-mini run: a valid envelope, then the model
    // looping on filler. Parsing all-or-nothing threw the answer away and
    // surfaced the whole transcript as the result.
    const chatter = " continuous.".repeat(400);
    const result = parseResult(
      `{"rewritten":"Avant de commencer, dis-moi si tu es capable.","profile":"clean","changes":[],"warnings":[]}` +
        ` PMID: N/A?> I see an extra trailing text—Oops.${chatter} STOP.`,
    );

    expect(result.format).toBe("structured");
    expect(result.rewritten).toBe("Avant de commencer, dis-moi si tu es capable.");
    expect(result.rewritten).not.toContain("continuous");
    expect(result.profile).toBe("clean");
  });

  it("does not end the object on a brace inside the rewritten text", () => {
    const result = parseResult('{"rewritten":"Utilise {{ handlebars }} ici","warnings":[]}');
    expect(result.rewritten).toBe("Utilise {{ handlebars }} ici");
    expect(result.format).toBe("structured");
  });

  it("does not end the object on an escaped quote", () => {
    const result = parseResult('{"rewritten":"Il a dit \\"oui\\" hier","warnings":[]}  trailing');
    expect(result.rewritten).toBe('Il a dit "oui" hier');
    expect(result.format).toBe("structured");
  });

  it("still falls back to raw when there is no object at all", () => {
    const result = parseResult("juste du texte, aucun JSON");
    expect(result.format).toBe("raw");
    expect(result.rewritten).toBe("juste du texte, aucun JSON");
  });
});
