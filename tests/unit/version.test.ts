import { describe, expect, it } from "vitest";
import { version } from "@/version.js";
import { releaseTag } from "../../scripts/release.js";

describe("version", () => {
  it("should export a semantic version string", () => {
    expect(releaseTag(version)).toBe(`v${version}`);
  });
});
