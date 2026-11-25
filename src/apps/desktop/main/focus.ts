import type { SystemPermissionPane } from "@/apps/desktop/shared/ipc-contract.js";
import type { DesktopNativeBridge } from "./native-bridge.js";
import { permissionOf } from "./native-permission.js";

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
  /** The permission that kept the source app unknown, when one did. */
  private blockedBy: SystemPermissionPane | null = null;

  /** Records the currently frontmost application. Failure is not fatal. */
  async remember(bridge: DesktopNativeBridge): Promise<string | null> {
    try {
      this.sourceApp = await bridge.frontmostApp();
      this.blockedBy = null;
    } catch (error) {
      // Without Automation there is no way to know the source app: replace
      // degrades to copy, and says which permission would have avoided it.
      this.sourceApp = null;
      this.blockedBy = permissionOf(error);
    }
    return this.sourceApp;
  }

  /** The recorded source app, or null when it could not be determined. */
  get current(): string | null {
    return this.sourceApp;
  }

  /** Why the source app is unknown, when a macOS permission is the reason. */
  get blocked(): SystemPermissionPane | null {
    return this.blockedBy;
  }

  clear(): void {
    this.sourceApp = null;
    this.blockedBy = null;
  }
}
