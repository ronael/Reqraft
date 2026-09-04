import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

interface NavigatorFixture {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}

interface DownloadPlatformModule {
  detectDesktopPlatform(navigatorLike: NavigatorFixture): string;
  applyPlatformDownloads(root: Document, navigatorLike: NavigatorFixture): string;
}

let platformModule: DownloadPlatformModule;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), "docs/assets/download-platform.js"),
  ).href;
  platformModule = (await import(moduleUrl)) as DownloadPlatformModule;
});

describe("website download platform", () => {
  it.each([
    ["macOS", { platform: "MacIntel", userAgent: "Mozilla/5.0 Macintosh" }, "macos"],
    ["Windows", { platform: "Win32", userAgent: "Mozilla/5.0 Windows NT 10.0" }, "windows"],
    ["Linux", { platform: "Linux x86_64", userAgent: "Mozilla/5.0 Linux" }, "linux"],
    ["Android", { platform: "Linux armv8l", userAgent: "Mozilla/5.0 Android" }, "other"],
    ["ChromeOS", { platform: "Linux x86_64", userAgent: "Mozilla/5.0 CrOS" }, "other"],
    [
      "iPad desktop mode",
      { platform: "MacIntel", userAgent: "Mozilla/5.0 Macintosh", maxTouchPoints: 5 },
      "other",
    ],
  ])("detects %s without offering an incompatible build", (_name, navigatorLike, expected) => {
    expect(platformModule.detectDesktopPlatform(navigatorLike)).toBe(expected);
  });

  it("updates every CTA and recommends the matching Windows build", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
      <span data-release-status></span>
      <a data-platform-download href="#download"><strong></strong><small></small></a>
      <a data-platform-download href="#download"><strong></strong><small></small></a>
      <div data-platform-row="macos"><a data-platform-link></a></div>
      <div data-platform-row="windows"><a data-platform-link></a></div>
      <div data-platform-row="linux"><a data-platform-link></a></div>
    </body></html>`,
      { url: "https://ronael.github.io/Reqraft/" },
    );

    const platform = platformModule.applyPlatformDownloads(dom.window.document, {
      userAgentData: { platform: "Windows" },
    });

    expect(platform).toBe("windows");
    expect(dom.window.document.documentElement.dataset.downloadPlatform).toBe("windows");
    expect(dom.window.document.querySelector("[data-release-status]")?.textContent).toBe(
      "Desktop Alpha",
    );

    for (const link of dom.window.document.querySelectorAll<HTMLAnchorElement>(
      "[data-platform-download]",
    )) {
      expect(link.href).toContain("Reqraft-0.6.0-win-x64-experimental.exe");
      expect(link.querySelector("strong")?.textContent).toBe("Download for Windows");
      expect(link.querySelector("small")?.textContent).toBe("Windows x64 · Alpha");
      expect(link.classList).toContain("platform-ready");
    }

    const windowsRow = dom.window.document.querySelector('[data-platform-row="windows"]');
    expect(windowsRow?.getAttribute("aria-current")).toBe("true");
    expect(windowsRow?.querySelector("[data-platform-link]")?.classList).toContain("primary");
    expect(
      dom.window.document.querySelector('[data-platform-row="macos"] [data-platform-link]')
        ?.classList,
    ).not.toContain("primary");
  });
});
