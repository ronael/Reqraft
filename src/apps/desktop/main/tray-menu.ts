import { t } from "./i18n.js";

export interface ShortcutSuspensionMenuItem {
  label: string;
  type: "checkbox";
  checked: boolean;
  click(item: { checked: boolean }): void;
}

/** Testable menu item used by Electron's tray context menu. */
export function createShortcutSuspensionMenuItem(
  suspended: boolean,
  onChange: (suspended: boolean) => void,
): ShortcutSuspensionMenuItem {
  return {
    label: t("main.traySuspendShortcuts"),
    type: "checkbox",
    checked: suspended,
    click: (item) => {
      onChange(item.checked);
    },
  };
}
