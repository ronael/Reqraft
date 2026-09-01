import type { Translate } from "./i18n.js";

/**
 * La touche de comparaison avant/après, écrite une fois.
 *
 * Le pied de la capsule l'annonce, et la présentation de bienvenue le rejoue
 * en maquette. Les deux ont déjà divergé — la capsule est passée à `⌘D`, qui
 * épingle, pendant que la maquette annonçait encore le `⌥` maintenu — et rien
 * ne le signalait : la première chose qu'une personne apprend du produit lui
 * montrait une touche qui n'est plus celle du pied.
 */
export const CAPSULE_COMPARE_KEY = "⌘D";

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
