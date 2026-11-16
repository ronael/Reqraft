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

function typesIn(input: string): string[] {
  return detectSecrets(input).map((match) => match.type);
}

describe("secret detector, AWS secret keys", () => {
  // The example key of the AWS documentation: 40 random base64 characters.
  const AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  // The same key without its only digit, as one real key in ~900 is.
  const AWS_SECRET_WITHOUT_DIGIT = "wJalrXUtnFEMI/KxMDENG/bPxRfiCYEXAMPLEKEY";

  // What a prompt written for a coding agent is made of.
  it.each([
    { kind: "a git SHA", input: "Revert 5b6eaa188532d6dd6c822626f67d37fa364eb8cd and rerun CI" },
    {
      kind: "a deep file path",
      input: "Fix /Users/dev/Projects/Reqraft/src/apps/desktop/renderer/capsule/App.tsx",
    },
    { kind: "a 40-character path", input: "Split Sources/App/Features/Settings/ViewModels in two" },
    {
      kind: "a GitHub file URL",
      input: "See https://github.com/ronael/Reqraft/blob/main/src/core/secret-detector.ts#L14",
    },
    {
      kind: "a GitHub commit URL",
      input: "https://github.com/ronael/Reqraft/commit/5b6eaa188532d6dd6c822626f67d37fa364eb8cd",
    },
    { kind: "a long identifier", input: "Rename handleProviderConfigurationChangeRequest" },
    {
      kind: "a lockfile integrity hash",
      input:
        "integrity: sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
    },
  ])("does not take $kind for a secret", ({ input }) => {
    expect(detectSecrets(input)).toEqual([]);
  });

  it("finds a realistic key on its own", () => {
    expect(typesIn(`The key ${AWS_SECRET} stopped working`)).toEqual(["AWS secret key"]);
    expect(detectSecrets(`"${AWS_SECRET}"`)[0]?.value).toBe(AWS_SECRET);
  });

  it("finds both halves of a credentials file", () => {
    const credentials = [
      "[default]",
      "aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
      `aws_secret_access_key = ${AWS_SECRET}`,
    ].join("\n");
    expect(typesIn(credentials)).toEqual(["AWS access key", "AWS secret key"]);
  });

  it.each([
    `AWS_SECRET_ACCESS_KEY=${AWS_SECRET_WITHOUT_DIGIT}`,
    `aws_secret_access_key = ${AWS_SECRET_WITHOUT_DIGIT}`,
    `{ "SecretAccessKey": "${AWS_SECRET_WITHOUT_DIGIT}" }`,
    `secretAccessKey: '${AWS_SECRET_WITHOUT_DIGIT}'`,
  ])("finds a key with no digit under its label: %s", (input) => {
    expect(detectSecrets(input).map(({ type, value }) => ({ type, value }))).toEqual([
      { type: "AWS secret key", value: AWS_SECRET_WITHOUT_DIGIT },
    ]);
  });

  it("names a labelled key once, not once per pattern", () => {
    expect(typesIn(`AWS_SECRET_ACCESS_KEY=${AWS_SECRET}`)).toEqual(["AWS secret key"]);
  });
});

describe("secret detector, overlapping patterns", () => {
  // Patterns run from the most precise to the most generic. Mixed case and
  // digits, as real keys have: the AWS pattern only sees such runs.
  const MIXED_40 = `${"aB3".repeat(13)}x`;
  const MIXED_48 = "aB3".repeat(16);

  it.each([
    { kind: "an Anthropic key", input: `sk-ant-${MIXED_40}`, type: "Anthropic API key" },
    { kind: "an OpenAI key", input: `sk-${MIXED_48}`, type: "OpenAI API key" },
  ])("names $kind once, without the AWS-shaped run inside it", ({ input, type }) => {
    expect(typesIn(input)).toEqual([type]);
  });

  it("keeps the generic secret that holds a more precise key", () => {
    expect(typesIn(`API_KEY=sk-ant-${MIXED_40}`)).toEqual(["Anthropic API key", "generic secret"]);
  });

  it("keeps a match that only partly overlaps a more precise one", () => {
    // The Anthropic key stops at the slash; the AWS-shaped run goes on.
    expect(typesIn(`sk-ant-${"aB3".repeat(10)}aB/Cd4Ef5G`)).toEqual([
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
