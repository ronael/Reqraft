import type { CapsuleEvent, CapsuleState } from "@/apps/desktop/shared/capsule-machine.js";

/**
 * Les commandes clavier de la capsule, et l'état que deux d'entre elles
 * portent.
 *
 * Module pur, comme `capsule-machine.ts` : pas de DOM, pas d'Electron, pas de
 * React. La suite de tests tourne sous Node sans environnement DOM, donc une
 * règle laissée dans un `onKeyDown` n'est vérifiable qu'en relisant la source
 * — ce qui ne prouve rien. Ici elle s'appelle.
 *
 * La frappe est décrite par une forme structurelle plutôt que par
 * `KeyboardEvent` : un événement réel la satisfait, un objet nu aussi.
 */

/** Nommé une fois : ⌘D, le clic du pied et le réducteur le désignent tous. */
const PIN_COMPARISON = "pin-comparison";

/** Ce qu'une frappe demande, avant de savoir comment l'exécuter. */
export type CapsuleIntent =
  | "accept"
  | "copy"
  | "rerun"
  | "level-next"
  | "level-previous"
  | typeof PIN_COMPARISON
  | "hold-comparison"
  | "release-comparison"
  | "cancel"
  | "close";

/** Le strict nécessaire d'un `KeyboardEvent` pour décider. */
export interface CapsuleKeyStroke {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  /** L'appui est tenu, et le système répète le `keydown`. */
  readonly repeat?: boolean;
}

/**
 * Les états où le pied rend ses touches, donc les seuls où elles répondent.
 *
 * `esc` et `⌘.` sont volontairement hors de cette porte : fermer et
 * interrompre doivent marcher pendant que la capsule travaille.
 */
function commandable(state: CapsuleState): boolean {
  return state === "ready" || state === "comparison";
}

/**
 * Verrou majuscules, `⇧` : `event.key` remonte « D » là où le code attend
 * « d ». Les touches nommées (`Tab`, `Alt`…) ne sont pas concernées.
 */
function normaliser(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function resoudreCommande(key: string, stroke: CapsuleKeyStroke): CapsuleIntent | null {
  if (stroke.metaKey === true) {
    // `⌘⇥` appartient au système, et `⌘⏎` n'a pas de sens devant un résultat :
    // aucune combinaison avec ⌘ ne retombe sur les touches nues.
    if (key === "c") return "copy";
    if (key === "d") return PIN_COMPARISON;
    if (key === "r") return "rerun";
    return null;
  }
  if (key === "Enter") return "accept";
  if (key === "Alt") return "hold-comparison";
  if (key === "Tab") return stroke.shiftKey === true ? "level-previous" : "level-next";
  return null;
}

/** Ce que la capsule est en train de faire quand la touche arrive. */
export interface CapsuleKeyContext {
  readonly state: CapsuleState;
  /** Le curseur est dans le champ du résultat final. */
  readonly editing: boolean;
}

/**
 * La commande que la frappe désigne, sans encore regarder la répétition.
 *
 * Pendant une édition, la frappe appartient au champ : `⏎` ajoute une ligne,
 * `⇥` en sort, `⌘C` copie la sélection. Les leur reprendre pour en faire des
 * commandes rendrait le résultat inéditable — on n'écrit pas dans un champ
 * dont chaque touche déclenche autre chose. `esc` et `⌘.` restent hors de
 * cette porte, comme ils sont déjà hors de `commandable` : fermer et
 * interrompre ne dépendent d'aucun état.
 */
function commandeDeLaFrappe(
  stroke: CapsuleKeyStroke,
  context: CapsuleKeyContext,
): CapsuleIntent | null {
  const key = normaliser(stroke.key);
  if (key === "Escape") return "close";
  if (key === "." && stroke.metaKey === true) return "cancel";
  if (context.editing || !commandable(context.state)) return null;
  return resoudreCommande(key, stroke);
}

/** La commande demandée par un appui, ou `null` si la frappe ne dit rien ici. */
export function resolveCapsuleKeyDown(
  stroke: CapsuleKeyStroke,
  context: CapsuleKeyContext,
): CapsuleIntent | null {
  const intent = commandeDeLaFrappe(stroke, context);
  // ⌘D est la seule commande qui bascule, donc la seule que la répétition
  // trahit : un appui un peu tenu enchaîne les `keydown`, chacun inverserait
  // l'épinglage, et l'état final dépendrait de la durée de l'appui — la
  // comparaison clignoterait pour finir du mauvais côté une fois sur deux.
  //
  // Les autres gardent la répétition qu'elles ont toujours eue : elles ne
  // basculent rien. ⇥ enchaîne les niveaux, ⌥ est idempotent, ⏎ ⌘C ⌘R esc et
  // ⌘. redemandent la même chose.
  return intent === PIN_COMPARISON && stroke.repeat === true ? null : intent;
}

/**
 * Le relâchement de `⌥`, quel que soit l'état.
 *
 * Filtrer par état laisserait le maintien allumé si la capsule change d'état
 * entre l'appui et le relâchement.
 */
export function resolveCapsuleKeyUp(stroke: CapsuleKeyStroke): CapsuleIntent | null {
  return stroke.key === "Alt" ? "release-comparison" : null;
}

/**
 * Les commandes qui doivent couper le comportement du navigateur.
 *
 * `⇥` déplacerait le focus, `⇧⇥` le remonterait, `⌘R` rechargerait la fenêtre
 * et `⌘D` ouvrirait un signet. `⏎`, `⌘C`, `esc` et `⌘.` n'ont rien à couper.
 */
const COUPE_LE_DEFAUT: ReadonlySet<CapsuleIntent> = new Set<CapsuleIntent>([
  "rerun",
  "level-next",
  "level-previous",
  PIN_COMPARISON,
]);

/**
 * La frappe doit-elle être retirée au navigateur ?
 *
 * La question se pose sur la frappe, pas sur la commande retenue : un `⌘D`
 * répété ne rebascule rien, mais reste une frappe de la capsule. La juger sur
 * le résultat de `resolveCapsuleKeyDown` rendrait le signet du navigateur à
 * partir de la deuxième répétition, c'est-à-dire au milieu d'un appui tenu.
 */
export function preventsBrowserDefault(
  stroke: CapsuleKeyStroke,
  context: CapsuleKeyContext,
): boolean {
  const intent = commandeDeLaFrappe(stroke, context);
  return intent !== null && COUPE_LE_DEFAUT.has(intent);
}

/**
 * Les deux façons de demander la comparaison, tenues séparément.
 *
 * `⌥` dure le temps de l'appui ; `⌘D` épingle. Les confondre en un seul
 * booléen ferait qu'un relâchement de `⌥` défait un épinglage — ou qu'un
 * `⌘D` laisse le maintien allumé après le relâchement.
 */
export interface ComparisonIntent {
  readonly holding: boolean;
  readonly pinned: boolean;
}

export const NO_COMPARISON: ComparisonIntent = { holding: false, pinned: false };

export function reduceComparison(
  current: ComparisonIntent,
  intent: CapsuleIntent,
): ComparisonIntent {
  // `current` est rendu tel quel quand rien ne change : le renderer garde
  // cette intention dans un état React, et une nouvelle identité à chaque
  // frappe relancerait un rendu pour rien — `⌥` répète son appui.
  if (intent === "hold-comparison") {
    return current.holding ? current : { ...current, holding: true };
  }
  if (intent === "release-comparison") {
    return current.holding ? { ...current, holding: false } : current;
  }
  if (intent === PIN_COMPARISON) return { ...current, pinned: !current.pinned };
  return current;
}

/** La comparaison est demandée dès que l'une des deux voies le dit. */
export function wantsComparison(comparison: ComparisonIntent): boolean {
  return comparison.holding || comparison.pinned;
}

/**
 * Les états où une comparaison épinglée reste vraie.
 *
 * L'« avant » affiché est l'entrée du run qui a produit le résultat montré.
 * Dès que la capsule quitte ces états — nouvelle capture, nouvelle génération,
 * fermeture, remplacement appliqué — la paire ne correspond plus à rien, et un
 * épinglage survivant rouvrirait la comparaison sur le run suivant.
 */
export function keepsComparison(state: CapsuleState): boolean {
  return state === "ready" || state === "comparison" || state === "applying";
}

/**
 * L'événement à envoyer pour que la machine reflète la comparaison voulue.
 *
 * Une seule règle, dérivée de l'état courant, plutôt qu'un `dispatch` à chaque
 * endroit qui touche `⌥` ou `⌘D` : c'est ce qui rend l'ordre des deux touches
 * sans importance.
 */
export function comparisonEvent(state: CapsuleState, wanted: boolean): CapsuleEvent | null {
  if (wanted && state === "ready") return "compare";
  if (!wanted && state === "comparison") return "compare-end";
  return null;
}
