import { describe, expect, it, vi } from "vitest";
import { DesktopUpdateService } from "@/apps/desktop/main/update-service.js";

describe("desktop update service", () => {
  it("keeps the available release and its trusted download URL", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tag_name: "v2.0.0",
            html_url: "https://github.com/ronael/Reqraft/releases/tag/v2.0.0",
            published_at: "2026-08-31T10:00:00Z",
          }),
      }),
    );
    const service = new DesktopUpdateService("1.0.0", fetcher);

    await expect(service.check()).resolves.toMatchObject({
      status: "available",
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
    });
    expect(service.downloadUrl()).toBe("https://github.com/ronael/Reqraft/releases/tag/v2.0.0");
  });

  it("coalesces simultaneous checks", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tag_name: "v1.0.0",
            html_url: "https://github.com/ronael/Reqraft/releases/tag/v1.0.0",
          }),
      }),
    );
    const service = new DesktopUpdateService("1.0.0", fetcher);

    await Promise.all([service.check(), service.check()]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.state().status).toBe("up-to-date");
  });

  it("turns a network failure into a non-fatal state", async () => {
    const service = new DesktopUpdateService("1.0.0", () => Promise.reject(new Error("offline")));

    await expect(service.check()).resolves.toMatchObject({
      status: "error",
      currentVersion: "1.0.0",
    });
  });
});
