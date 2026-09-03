import { describe, expect, it } from "vitest";
import { checkDesktopUpdate, checkNpmUpdate, isVersionNewer } from "@/updates/check.js";

const response = (payload: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: () => Promise.resolve(payload),
});

describe("update checks", () => {
  it.each([
    ["0.5.1", "0.5.0", true],
    ["0.6.0", "0.5.9", true],
    ["1.0.0", "0.99.99", true],
    ["0.5.0", "0.5.0", false],
    ["0.4.9", "0.5.0", false],
    ["0.5.0", "0.5.0-rc.1", true],
    ["0.5.0-beta.2", "0.5.0-beta.1", true],
  ])("compares %s against %s", (candidate, current, expected) => {
    expect(isVersionNewer(candidate, current)).toBe(expected);
  });

  it("reads the npm latest endpoint without confusing equal versions", async () => {
    const result = await checkNpmUpdate("0.5.0", {
      fetcher: () => Promise.resolve(response({ version: "0.5.0" })),
    });
    expect(result).toMatchObject({ latestVersion: "0.5.0", available: false });
  });

  it("normalizes a GitHub v-prefixed release", async () => {
    const result = await checkDesktopUpdate("0.5.0", {
      fetcher: () =>
        Promise.resolve(
          response({
            tag_name: "v0.6.0",
            html_url: "https://github.com/ronael/Reqraft/releases/tag/v0.6.0",
            published_at: "2026-08-30T12:00:00Z",
          }),
        ),
    });
    expect(result).toMatchObject({ latestVersion: "0.6.0", available: true });
  });

  it("refuses to open a release URL outside the Reqraft GitHub repository", async () => {
    await expect(
      checkDesktopUpdate("0.5.0", {
        fetcher: () =>
          Promise.resolve(
            response({
              tag_name: "v0.6.0",
              html_url: "https://example.test/fake-release",
            }),
          ),
      }),
    ).rejects.toThrow();
  });

  it("rejects an unsuccessful registry response", async () => {
    await expect(
      checkNpmUpdate("0.5.0", {
        fetcher: () => Promise.resolve(response({}, false, 503)),
      }),
    ).rejects.toThrow("HTTP 503");
  });
});
