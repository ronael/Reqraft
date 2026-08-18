import { BrowserWindow } from "electron";

/**
 * Settings window (DESKTOP.md §3, §4.3): 560×480, horizontal tabs, opened
 * maybe once a month — a normal framed window, not a panel. Lot 4 ships the
 * shell and the entry points (tray, popover, capsule); the five tabs land in
 * lot 5.
 */
export const SETTINGS_WIDTH = 560;
export const SETTINGS_HEIGHT = 480;

export interface SettingsWindowOptions {
  preloadPath: string;
  /** `rq://` URL of the renderer, surface already applied. */
  rendererUrl: string;
  devServerUrl?: string;
}

export function createSettingsWindow(options: SettingsWindowOptions): Electron.BrowserWindow {
  const window = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    resizable: false,
    show: false,
    title: "Reqraft — Réglages",
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preloadPath,
      // Non-negotiable (DESKTOP.md §2.3).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  void window.loadURL(options.devServerUrl ?? options.rendererUrl);
  return window;
}
