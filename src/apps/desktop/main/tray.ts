import { Menu, Tray, app, nativeImage } from "electron";
import { suspendedTrayTooltip, trayIconPng, trayTooltip, type TrayState } from "./tray-icon.js";
import { t } from "./i18n.js";
import { createShortcutSuspensionMenuItem } from "./tray-menu.js";

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
  onShortcutsSuspendedChange: (suspended: boolean) => void;
}

export interface TrayController {
  setState(state: TrayState): void;
  setAvailableUpdate(version: string, onOpen: () => void): void;
  getState(): TrayState;
  setShortcutsSuspended(suspended: boolean): void;
  areShortcutsSuspended(): boolean;
  /**
   * The icon rectangle, so a keyboard trigger anchors the popover exactly where
   * a click would. Only the click event carries these bounds, and the global
   * shortcut has no event — without this the two ways in would open the same
   * panel in two different places.
   */
  getBounds(): Electron.Rectangle;
  destroy(): void;
}

export function createTray(actions: TrayActions): TrayController {
  let state: TrayState = "repos";
  let shortcutsSuspended = false;
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
      createShortcutSuspensionMenuItem(shortcutsSuspended, setShortcutsSuspended),
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
    tray.setToolTip(shortcutsSuspended ? suspendedTrayTooltip() : trayTooltip(next));
  }

  function setShortcutsSuspended(suspended: boolean): void {
    actions.onShortcutsSuspendedChange(suspended);
    shortcutsSuspended = suspended;
    applyState(state);
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
    setShortcutsSuspended,
    areShortcutsSuspended: () => shortcutsSuspended,
    getBounds: () => tray.getBounds(),
    destroy: () => {
      tray.destroy();
    },
  };
}
