import { BrowserWindow } from "electron";

/**
 * Onboarding window: what someone sees when they installed the application and
 * nothing else.
 *
 * A normal framed window rather than a panel, because it is the first thing
 * this person meets and it has to look like an application rather than a
 * transient overlay. Narrower and shorter than the settings window: it asks a
 * handful of questions in one column, and giving it the settings' width would
 * leave the form stranded in empty space.
 */
export const ONBOARDING_WIDTH = 680;
export const ONBOARDING_HEIGHT = 600;

export interface OnboardingWindowOptions {
  preloadPath: string;
  /** `rq://` URL of the renderer, surface already applied. */
  rendererUrl: string;
  devServerUrl?: string;
}

export function createOnboardingWindow(options: OnboardingWindowOptions): Electron.BrowserWindow {
  const window = new BrowserWindow({
    width: ONBOARDING_WIDTH,
    height: ONBOARDING_HEIGHT,
    minWidth: 560,
    minHeight: 520,
    resizable: true,
    show: false,
    title: "Reqraft — Configuration",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preloadPath,
      // Non-negotiable (DESKTOP.md §2.3), and all the more so here: this is
      // the window a credential is typed into.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  void window.loadURL(options.devServerUrl ?? options.rendererUrl);
  return window;
}
