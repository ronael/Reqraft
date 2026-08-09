import { describe, expect, it } from "vitest";
import { releaseTag } from "../../scripts/release.js";

describe("release command", () => {
  it("derives the tag from a valid package version", () => {
    expect(releaseTag("0.1.6")).toBe("v0.1.6");
    expect(releaseTag("1.0.0-beta.1")).toBe("v1.0.0-beta.1");
  });

  it("rejects malformed versions", () => {
    expect(() => {
      releaseTag("release-1");
    }).toThrow("Version invalide");
  });
});
