import { BrowserWindow } from "electron";

/**
 * The capsule window (DESKTOP.md §4.3): width fixed at 560, height reserved
 * up front so the window never jumps while the stream arrives. Lot 1 keeps a
 * plain framed window; frameless transparent anchoring lands with lot 3.
 */

export const CAPSULE_WIDTH = 560;
export const CAPSULE_MIN_HEIGHT = 480;

export interface CapsuleWindowOptions {
  preloadPath: string;
  rendererFile: string;
  /** Vite dev server URL; when absent the built renderer is loaded. */
  devServerUrl?: string;
}

export function createCapsuleWindow(options: CapsuleWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: CAPSULE_WIDTH,
    height: CAPSULE_MIN_HEIGHT,
    minWidth: CAPSULE_WIDTH,
    minHeight: CAPSULE_MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preloadPath,
      // Non-negotiable (DESKTOP.md §2.3).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // No ready-to-show reveal: the capsule stays hidden until a global shortcut
  // triggers it. It is not a windowed app, it appears on demand (§1).

  if (options.devServerUrl) {
    void window.loadURL(options.devServerUrl);
  } else {
    void window.loadFile(options.rendererFile);
  }
  return window;
}
