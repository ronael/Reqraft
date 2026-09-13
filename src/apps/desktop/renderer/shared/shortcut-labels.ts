import type { Translate } from "./i18n.js";
import type { DesktopPlatform } from "@/apps/desktop/shared/ipc-contract.js";

/** Raccourcis locaux partagés par la capsule, le popover et leur maquette. */
export const CAPSULE_SHORTCUTS = {
  submit: "CommandOrControl+Enter",
  compare: "CommandOrControl+D",
  copy: "CommandOrControl+C",
  rerun: "CommandOrControl+R",
  interrupt: "CommandOrControl+.",
  settings: "CommandOrControl+,",
} as const;

/** macOS uses Command; Windows and Linux use Control for application commands. */
export function isMacOS(platform: DesktopPlatform): boolean {
  return platform === "darwin";
}

/** The modifier that drives ordinary application commands on this platform. */
export function hasPrimaryModifier(
  stroke: Readonly<{ metaKey?: boolean; ctrlKey?: boolean }>,
  platform: DesktopPlatform,
): boolean {
  return isMacOS(platform) ? stroke.metaKey === true : stroke.ctrlKey === true;
}

const CMD_LABEL = "shortcut.cmd";
const CTRL_LABEL = "shortcut.ctrl";
const OPTION_LABEL = "shortcut.option";
const ALT_LABEL = "shortcut.alt";
const SHIFT_LABEL = "shortcut.shift";

const MACOS_MODIFIER_LABELS: Readonly<Record<string, string>> = {
  CommandOrControl: CMD_LABEL,
  Command: CMD_LABEL,
  Control: CTRL_LABEL,
  Alt: OPTION_LABEL,
  Shift: SHIFT_LABEL,
};

const PORTABLE_MODIFIER_LABELS: Readonly<Record<string, string>> = {
  CommandOrControl: CTRL_LABEL,
  Command: CMD_LABEL,
  Control: CTRL_LABEL,
  Alt: ALT_LABEL,
  Shift: SHIFT_LABEL,
};

/** Accelerator written in words so every modifier remains unambiguous. */
function modifierLabel(modifier: string, platform: DesktopPlatform): string | null {
  const labels = isMacOS(platform) ? MACOS_MODIFIER_LABELS : PORTABLE_MODIFIER_LABELS;
  return labels[modifier] ?? null;
}

export function formatAccelerator(
  accelerator: string,
  t: Translate = (key) => key,
  platform: DesktopPlatform = "darwin",
): string {
  if (accelerator === "") return "—";
  return accelerator
    .split("+")
    .map((part) => {
      const labelKey = modifierLabel(part, platform);
      return labelKey === null ? keyLabel(part, t) : t(labelKey);
    })
    .join(" + ");
}

/** Compact labels for the action chips, keeping their narrow capsule layout. */
export function formatCapsuleShortcut(
  accelerator: string,
  platform: DesktopPlatform = "darwin",
): string {
  return accelerator
    .split("+")
    .map((part) => compactKeyLabel(part, platform))
    .join(isMacOS(platform) ? "" : "+");
}

const MACOS_COMPACT_KEY_LABELS: Readonly<Record<string, string>> = {
  CommandOrControl: "⌘",
  Command: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Enter: "↵",
  Escape: "esc",
  Space: "Space",
};

const PORTABLE_COMPACT_KEY_LABELS: Readonly<Record<string, string>> = {
  CommandOrControl: "Ctrl",
  Command: "⌘",
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Enter: "↵",
  Escape: "esc",
  Space: "Space",
};

function compactKeyLabel(part: string, platform: DesktopPlatform): string {
  const labels = isMacOS(platform) ? MACOS_COMPACT_KEY_LABELS : PORTABLE_COMPACT_KEY_LABELS;
  return labels[part] ?? part;
}

function keyLabel(part: string, t: Translate): string {
  if (part === "Space") return t("shortcut.space");
  return part;
}
