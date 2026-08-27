import { BrowserWindow } from "electron";
import { t } from "../i18n.js";

/**
 * Settings window (DESKTOP.md §3, §4.3): a normal framed window, not a panel.
 * The renderer follows the full desktop mockup: title bar, sidebar, content
 * pane and status bar, which needs real width rather than the old compact tab
 * surface.
 */
export const SETTINGS_WIDTH = 900;
export const SETTINGS_HEIGHT = 640;

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
    minWidth: 760,
    minHeight: 540,
    resizable: true,
    show: false,
    title: t("main.settingsTitle"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
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
