import { describe, expect, it } from "vitest";
import { detectSecrets, hasSecrets } from "../../src/core/secret-detector.js";
import { redactSecrets } from "../../src/utils/redaction.js";

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

describe("redaction", () => {
  it("replaces detected secrets with placeholder", () => {
    const redacted = redactSecrets("API_KEY=secret123 et PASSWORD=motdepasse");
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("secret123");
    expect(redacted).not.toContain("motdepasse");
  });
});
