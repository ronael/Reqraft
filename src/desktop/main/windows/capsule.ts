import { BrowserWindow, screen } from "electron";
import { placeCapsule, type CapsuleAnchor } from "./placement.js";

/**
 * The capsule window (DESKTOP.md §3, §4.3): 560 wide, frameless, transparent,
 * HUD vibrancy, above other windows, anchored at the cursor. The minimum
 * height is reserved up front so the window never jumps while the stream
 * arrives.
 */
export const CAPSULE_WIDTH = 560;
/** Roughly header + 8 body lines + footer: the reserved minimum (§4.3). */
export const CAPSULE_HEIGHT = 380;

export interface CapsuleWindowOptions {
  preloadPath: string;
  /** `rq://` URL of the renderer (custom protocol — modules fail on file://). */
  rendererUrl: string;
  /** Vite dev server URL; when absent the built renderer is loaded. */
  devServerUrl?: string;
}

export interface CapsuleWindow {
  window: Electron.BrowserWindow;
  /** Places the capsule on its anchor, then shows and focuses it. */
  show(anchor: CapsuleAnchor): void;
  hide(): void;
}

export function createCapsuleWindow(options: CapsuleWindowOptions): CapsuleWindow {
  const window = new BrowserWindow({
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    // macOS: panel behaviour + HUD vibrancy.
    type: "panel",
    vibrancy: "hud",
    webPreferences: {
      preload: options.preloadPath,
      // Non-negotiable (DESKTOP.md §2.3).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Visible on every macOS space, like a HUD panel.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // The capsule is transient: losing the focus dissolves it. The replacement
  // flow relies on this — the source app gets the focus back (§5.2).
  window.on("blur", () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });

  void window.loadURL(options.devServerUrl ?? options.rendererUrl);

  return {
    window,
    show(anchor) {
      const referencePoint =
        anchor.kind === "cursor" ? anchor.point : screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(referencePoint);
      const { x, y } = placeCapsule(
        anchor,
        { width: CAPSULE_WIDTH, height: CAPSULE_HEIGHT },
        display.workArea,
      );
      window.setPosition(x, y);
      window.show();
      window.focus();
    },
    hide() {
      window.hide();
    },
  };
}
