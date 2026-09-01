/**
 * Tray icons — tiny PNGs embedded as base64 so the tray works identically in
 * dev, in the bundled main process and inside the packaged asar (lot 6): no
 * asset path to resolve, ever.
 *
 * Each icon is an 18×18 RGBA dot, generated once by a throwaway script (see
 * WORKLOG lot 4). Violet at rest, strong violet while a run is in flight,
 * rose on error — the three tray states of DESKTOP.md lot 4.
 */

import { t } from "./i18n.js";

export type TrayState = "repos" | "busy" | "error";

const ICONS: Record<TrayState, string> = {
  repos:
    "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAWklEQVR42mNgGFJgefcvcSC2hWJxcgwAadwOxP/RMEjMllhDUrEYgI5TiXHJfyKxLT6DtpNg0HZ8AfufRCxOqbdwe4+aBlHHa1QLbKpGP9USJFWzCFUz7YACAJu3vOSeGq7vAAAAAElFTkSuQmCC",
  busy: "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAWklEQVR42mNgGFKgO+abOBDbQrE4OQaANG4H4v9oGCRmS6whqVgMQMepxLjkP5HYFp9B20kwaDu+gP1PIhan1Fu4vUdNg6jjNaoFNlWjn2oJkqpZhKqZdkABADm6jzhBf6CFAAAAAElFTkSuQmCC",
  error:
    "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAWklEQVR42mNgGFLgd2GrOBDbQrE4OQaANG4H4v9oGCRmS6whqVgMQMepxLjkP5HYFp9B20kwaDu+gP1PIhan1Fu4vUdNg6jjNaoFNlWjn2oJkqpZhKqZdkABAG/omsi/nhPlAAAAAElFTkSuQmCC",
};

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
