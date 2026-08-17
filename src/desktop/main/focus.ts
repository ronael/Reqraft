import type { MacosBridge } from "./macos.js";

/**
 * Source-application memory (DESKTOP.md §5.2).
 *
 * The capsule needs the keyboard, so it takes the focus — but ⌘V must land in
 * the application the text came from. The frontmost app is therefore recorded
 * BEFORE the capsule opens, and `result:accept` reinjects into that recorded
 * app, never into whatever is frontmost at accept time.
 *
 * Electron-free: the bridge is injected.
 */
export class FocusTracker {
  private sourceApp: string | null = null;

  /** Records the currently frontmost application. Failure is not fatal. */
  async remember(bridge: MacosBridge): Promise<string | null> {
    try {
      this.sourceApp = await bridge.frontmostApp();
    } catch {
      // Without Automation there is no way to know the source app: replace
      // will degrade to copy, which permissions:state already announced.
      this.sourceApp = null;
    }
    return this.sourceApp;
  }

  /** The recorded source app, or null when it could not be determined. */
  get current(): string | null {
    return this.sourceApp;
  }

  clear(): void {
    this.sourceApp = null;
  }
}
