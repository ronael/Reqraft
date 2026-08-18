import { describe, expect, it } from "vitest";
import { version } from "@/version.js";

describe("version", () => {
  it("should export a semantic version string", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
