import type { Translate } from "./i18n.js";

/** Accelerator written in words so every modifier remains unambiguous. */
const MODIFIER_KEYS: readonly (readonly [string, string])[] = [
  ["CommandOrControl", "shortcut.cmd"],
  ["Command", "shortcut.cmd"],
  ["Control", "shortcut.ctrl"],
  ["Alt", "shortcut.option"],
  ["Shift", "shortcut.shift"],
];

export function formatAccelerator(accelerator: string, t: Translate = (key) => key): string {
  if (accelerator === "") return "—";
  return accelerator
    .split("+")
    .map((part) => {
      const modifier = MODIFIER_KEYS.find(([name]) => name === part);
      return modifier ? t(modifier[1]) : keyLabel(part, t);
    })
    .join(" + ");
}

function keyLabel(part: string, t: Translate): string {
  if (part === "Space") return t("shortcut.space");
  return part;
}
