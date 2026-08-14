import { Menu, Tray, app, nativeImage, type Rectangle } from "electron";
import { trayIconPng, trayTooltip, type TrayState } from "./tray-icon.js";

/**
 * Menu-bar presence (DESKTOP.md lot 4): the only persistent element of the
 * product. Three states — repos, busy, error — surfaced through the icon and
 * the tooltip; no notifications, no focus theft.
 *
 * The click toggles the popover; the menu stays for Quit and Settings.
 */
export interface TrayActions {
  onTogglePopover: (anchorBounds: Rectangle) => void;
  onOpenSettings: () => void;
}

export interface TrayController {
  setState(state: TrayState): void;
  getState(): TrayState;
  destroy(): void;
}

export function createTray(actions: TrayActions): TrayController {
  let state: TrayState = "repos";
  const tray = new Tray(nativeImage.createFromBuffer(trayIconPng(state)));

  const contextMenu = Menu.buildFromTemplate([
    { label: "Réglages…", click: actions.onOpenSettings },
    { type: "separator" },
    {
      label: "Quitter Reqraft",
      click: () => {
        app.quit();
      },
    },
  ]);

  function applyState(next: TrayState): void {
    state = next;
    tray.setImage(nativeImage.createFromBuffer(trayIconPng(next)));
    tray.setToolTip(trayTooltip(next));
  }

  applyState(state);
  tray.on("click", (_event, bounds) => {
    actions.onTogglePopover(bounds);
  });
  tray.on("right-click", () => {
    tray.popUpContextMenu(contextMenu);
  });

  return {
    setState: applyState,
    getState: () => state,
    destroy: () => {
      tray.destroy();
    },
  };
}
