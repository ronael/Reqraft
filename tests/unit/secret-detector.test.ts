import { describe, expect, it } from "vitest";
import { detectSecrets, hasSecrets } from "@/core/secret-detector.js";
import { redactSecrets } from "@/utils/redaction.js";

describe("secret detector", () => {
  it("detects GitHub token", () => {
    const matches = detectSecrets("token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.type).toBe("GitHub token");
  });

  it("detects generic secret variable", () => {
    const matches = detectSecrets("API_KEY=sk-1234567890abcdef");
    expect(matches.length).toBeGreaterThan(0);
    const types = matches.map((m) => m.type);
    expect(types).toContain("generic secret");
  });

  it("detects private key", () => {
    const matches = detectSecrets("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("returns false for clean text", () => {
    expect(hasSecrets("bonjour comment vas tu")).toBe(false);
  });
});

describe("secret detector, overlapping patterns", () => {
  // Patterns run from the most precise to the most generic.
  function typesIn(input: string): string[] {
    return detectSecrets(input).map((match) => match.type);
  }

  it.each([
    { kind: "an Anthropic key", input: `sk-ant-${"x".repeat(40)}`, type: "Anthropic API key" },
    { kind: "an OpenAI key", input: `sk-${"x".repeat(48)}`, type: "OpenAI API key" },
  ])("names $kind once, without the AWS-shaped run inside it", ({ input, type }) => {
    expect(typesIn(input)).toEqual([type]);
  });

  it("keeps the generic secret that holds a more precise key", () => {
    expect(typesIn(`API_KEY=sk-ant-${"x".repeat(40)}`)).toEqual([
      "Anthropic API key",
      "generic secret",
    ]);
  });

  it("keeps a match that only partly overlaps a more precise one", () => {
    // The Anthropic key stops at the slash; the AWS-shaped run goes on.
    expect(typesIn(`sk-ant-${"x".repeat(32)}/${"y".repeat(20)}`)).toEqual([
      "Anthropic API key",
      "AWS secret key",
    ]);
  });
});

describe("redaction", () => {
  it("replaces detected secrets with placeholder", () => {
    const redacted = redactSecrets("API_KEY=secret123 et PASSWORD=motdepasse");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("secret123");
    expect(redacted).not.toContain("motdepasse");
  });
});
