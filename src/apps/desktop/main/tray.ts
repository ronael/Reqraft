import { Menu, Tray, app, nativeImage } from "electron";
import { trayIconPng, trayTooltip, type TrayState } from "./tray-icon.js";
import { t } from "./i18n.js";

/**
 * Menu-bar presence (DESKTOP.md lot 4): the only persistent element of the
 * product. Three states — repos, busy, error — surfaced through the icon and
 * the tooltip; no notifications, no focus theft.
 *
 * The click toggles the popover; the menu stays for Quit and Settings.
 */
export interface TrayActions {
  onTogglePopover: (anchorBounds: Electron.Rectangle) => void;
  onOpenSettings: () => void;
}

export interface TrayController {
  setState(state: TrayState): void;
  setAvailableUpdate(version: string, onOpen: () => void): void;
  getState(): TrayState;
  destroy(): void;
}

export function createTray(actions: TrayActions): TrayController {
  let state: TrayState = "repos";
  let availableUpdate: { version: string; onOpen: () => void } | null = null;
  const tray = new Tray(nativeImage.createFromBuffer(trayIconPng(state)));

  const contextMenu = (): Electron.Menu =>
    Menu.buildFromTemplate([
      ...(availableUpdate === null
        ? []
        : [
            {
              label: t("main.trayUpdateAvailable", { version: availableUpdate.version }),
              click: availableUpdate.onOpen,
            },
            { type: "separator" as const },
          ]),
      { label: t("main.traySettings"), click: actions.onOpenSettings },
      { type: "separator" },
      {
        label: t("main.trayQuit"),
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
    tray.popUpContextMenu(contextMenu());
  });

  return {
    setState: applyState,
    setAvailableUpdate: (version, onOpen) => {
      availableUpdate = { version, onOpen };
    },
    getState: () => state,
    destroy: () => {
      tray.destroy();
    },
  };
}
