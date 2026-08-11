import type { Translator } from "../i18n/translate.js";

export function getShortcuts(t: Translator): string[] {
  return [
    t("tui.shortcut.generate"),
    t("tui.shortcut.profile"),
    t("tui.shortcut.level"),
    t("tui.shortcut.provider"),
    t("tui.shortcut.model"),
    t("tui.shortcut.diff"),
    t("tui.shortcut.explain"),
    t("tui.shortcut.copy"),
    t("tui.shortcut.paste"),
    t("tui.shortcut.reset"),
    t("tui.shortcut.focus"),
  ];
}
