import { describe, expect, it } from "vitest";
import { parseResult, stripMarkdownFences } from "../../src/core/result-parser.js";

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
});
