import { BrowserWindow, app, screen } from "electron";
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
  /**
   * Envoie un message au renderer, ou ne fait rien si la fenêtre a disparu.
   *
   * `show()` se gardait déjà de la destruction, mais les appelants allaient
   * ensuite chercher `window.webContents` eux-mêmes : la garde était au mauvais
   * endroit, et la ligne suivante levait « Object has been destroyed ». Comme
   * elle était levée depuis un `.catch`, la nouvelle erreur ne pouvait plus
   * être rattrapée — d'où les rejets non gérés en cascade.
   */
  notify(channel: string, payload: unknown): void;
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

  // esc / ⏎ call `window.close()` in the renderer: convert that into a hide.
  // Letting the window be destroyed would kill the NEXT shortcut trigger
  // ("Object has been destroyed" on show).
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

  return {
    window,
    notify(channel, payload) {
      if (window.isDestroyed()) {
        return;
      }
      window.webContents.send(channel, payload);
    },
    show(anchor) {
      if (window.isDestroyed()) {
        return;
      }
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
      if (!window.isDestroyed()) {
        window.hide();
      }
    },
  };
}
