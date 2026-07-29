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
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
