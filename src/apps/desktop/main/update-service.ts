import { checkDesktopUpdate, type UpdateFetcher } from "@/updates/check.js";
import type { DesktopUpdateState } from "@/apps/desktop/shared/ipc-contract.js";

export class DesktopUpdateService {
  private current: DesktopUpdateState;
  private pending: Promise<DesktopUpdateState> | null = null;
  private releaseUrl: string | null = null;

  constructor(
    private readonly currentVersion: string,
    private readonly fetcher?: UpdateFetcher,
  ) {
    this.current = { status: "idle", currentVersion };
  }

  state(): DesktopUpdateState {
    return { ...this.current };
  }

  downloadUrl(): string | null {
    return this.releaseUrl;
  }

  check(): Promise<DesktopUpdateState> {
    if (this.pending !== null) return this.pending;
    this.current = { status: "checking", currentVersion: this.currentVersion };
    this.pending = this.performCheck().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async performCheck(): Promise<DesktopUpdateState> {
    try {
      const update = await checkDesktopUpdate(this.currentVersion, { fetcher: this.fetcher });
      this.releaseUrl = update.url;
      this.current = {
        status: update.available ? "available" : "up-to-date",
        currentVersion: update.currentVersion,
        latestVersion: update.latestVersion,
        checkedAt: new Date().toISOString(),
        ...(update.publishedAt === undefined ? {} : { publishedAt: update.publishedAt }),
      };
    } catch {
      this.current = {
        status: "error",
        currentVersion: this.currentVersion,
        checkedAt: new Date().toISOString(),
      };
    }
    return this.state();
  }
}
