import { BrowserWindow, screen } from "electron";
import { placePopover } from "./placement.js";

/**
 * Popover (DESKTOP.md lot 4, §4.3): 320 wide, anchored under the menu-bar
 * icon. Same component family as the capsule, second anchor.
 */
export const POPOVER_WIDTH = 320;
export const POPOVER_HEIGHT = 260;

export interface PopoverWindowOptions {
  preloadPath: string;
  rendererFile: string;
  devServerUrl?: string;
}

export interface PopoverWindow {
  window: Electron.BrowserWindow;
  toggle(trayBounds: Electron.Rectangle): void;
  show(trayBounds: Electron.Rectangle): void;
  hide(): void;
}

export function createPopoverWindow(options: PopoverWindowOptions): PopoverWindow {
  const window = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
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

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  window.on("blur", () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });

  if (options.devServerUrl) {
    void window.loadURL(`${options.devServerUrl}?surface=popover`);
  } else {
    void window.loadFile(options.rendererFile, { query: { surface: "popover" } });
  }

  function show(trayBounds: Electron.Rectangle): void {
    const display = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y,
    });
    const { x, y } = placePopover(
      trayBounds,
      { width: POPOVER_WIDTH, height: POPOVER_HEIGHT },
      display.workArea,
    );
    window.setPosition(x, y);
    window.show();
    window.focus();
  }

  return {
    window,
    toggle(trayBounds) {
      if (window.isVisible()) {
        window.hide();
      } else {
        show(trayBounds);
      }
    },
    show,
    hide() {
      window.hide();
    },
  };
}
