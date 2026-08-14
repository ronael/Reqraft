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
  rendererFile: string;
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

  if (options.devServerUrl) {
    void window.loadURL(`${options.devServerUrl}?surface=settings`);
  } else {
    void window.loadFile(options.rendererFile, { query: { surface: "settings" } });
  }
  return window;
}
