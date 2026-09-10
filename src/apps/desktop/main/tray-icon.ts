/**
 * Tray icons — tiny PNGs embedded as base64 so the tray works identically in
 * dev, in the bundled main process and inside the packaged asar (lot 6): no
 * asset path to resolve, ever.
 *
 * Each icon is an 18×18 RGBA monogram, generated from the editable master by
 * scripts/generate-icon.ts. Violet at rest, strong violet while a run is in flight,
 * rose on error — the three tray states of DESKTOP.md lot 4.
 */

import ICONS from "./tray-icons.generated.json" with { type: "json" };
import { t } from "./i18n.js";

export type TrayState = "repos" | "busy" | "error";

/** Raw PNG bytes for a tray state — the caller wraps them in a nativeImage. */
export function trayIconPng(state: TrayState): Buffer {
  return Buffer.from(ICONS[state], "base64");
}

const TOOLTIP_KEYS: Record<TrayState, string> = {
  repos: "main.trayIdle",
  busy: "main.trayBusy",
  error: "main.trayError",
};

export function trayTooltip(state: TrayState): string {
  return t(TOOLTIP_KEYS[state]);
}

export function suspendedTrayTooltip(): string {
  return t("main.trayShortcutsSuspendedTooltip");
}
