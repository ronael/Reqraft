import type { Translate } from "../shared/i18n.js";

/**
 * An accelerator written out in words.
 *
 * `⌘⌃⌥N` is four glyphs someone has to already know; three of them look alike
 * at 11px and ⌃ renders as a bare caret in most interface fonts, so `⌘^⌥N` is
 * what the user actually saw. Words cost a few characters and remove the
 * decoding step entirely — which matters most here, where the whole point is
 * to press the right keys.
 */
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

/** The non-modifier key, spelled where its name is clearer than its glyph. */
function keyLabel(part: string, t: Translate): string {
  if (part === "Space") return t("shortcut.space");
  return part;
}
