import { BrowserWindow, app, screen } from "electron";
import { placePopover } from "./placement.js";

/**
 * Popover (DESKTOP.md lot 4, §4.3): 320 wide, anchored under the menu-bar
 * icon. Same component family as the capsule, second anchor.
 */
export const POPOVER_WIDTH = 320;
export const POPOVER_HEIGHT = 260;

export interface PopoverWindowOptions {
  preloadPath: string;
  /** `rq://` URL of the renderer, surface already applied. */
  rendererUrl: string;
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

  // Same rule as the capsule: closing means hiding, so the window stays
  // reusable (esc in the popover, programmatic closes).
  let quitting = false;
  app.on("before-quit", () => {
    quitting = true;
  });
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });

  void window.loadURL(options.devServerUrl ?? options.rendererUrl);

  function show(trayBounds: Electron.Rectangle): void {
    if (window.isDestroyed()) {
      // Même faille que la capsule : `quitting` ne redescend jamais, et sur
      // macOS l'application survit sans fenêtre. Sortir en silence laisserait
      // l'icône de la barre de menus sans effet, sans rien dire.
      console.error("Reqraft: the popover was destroyed, restart the application.");
      return;
    }
    const anchor = anchorBounds(trayBounds);
    const display = screen.getDisplayNearestPoint({
      x: anchor.x,
      y: anchor.y,
    });
    const { x, y } = placePopover(
      anchor,
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
      if (window.isDestroyed()) {
        return;
      }
      if (window.isVisible()) {
        window.hide();
      } else {
        show(trayBounds);
      }
    },
    show,
    hide() {
      if (!window.isDestroyed()) {
        window.hide();
      }
    },
  };
}

/**
 * Where the popover hangs from when there is no icon rectangle to hang from.
 *
 * `Tray.getBounds()` answers a zero-sized rectangle on the platforms that do
 * not expose the icon geometry, and the global shortcut can fire before the
 * menu bar has laid the icon out. Placing at that rectangle would pin the
 * panel to the top-left corner of the leftmost display, which reads as a bug.
 * The top centre of the screen the cursor is on is where the icon would have
 * been — near enough that the panel still looks anchored to the menu bar.
 */
function anchorBounds(trayBounds: Electron.Rectangle): Electron.Rectangle {
  if (trayBounds.width > 0 && trayBounds.height > 0) {
    return trayBounds;
  }
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return {
    x: Math.round(workArea.x + workArea.width / 2),
    y: workArea.y,
    width: 0,
    height: 0,
  };
}
