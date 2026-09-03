import { REPROMPT_POLICY } from "./reprompt-policy.js";
import type { RepromptLevel } from "./types.js";

/**
 * La structure qu'une reformulation a ajoutée d'elle-même.
 *
 * L'expansion se mesure déjà en mots, mais elle passe à côté d'un cas précis et
 * fréquent : une phrase qui devient un cahier des charges à six puces. Le
 * nombre de mots peut rester dans les clous pendant que la demande a changé de
 * nature — « corrige les fautes » n'est pas « voici un plan en six points ».
 *
 * Comptable, indépendant de la langue, et sans réseau : c'est de la
 * vérification, pas une liste de termes à maintenir.
 */

export interface StructureCount {
  listItems: number;
  headings: number;
}

const LIST_ITEM = /^\s*(?:[*+\-•]|\d+[).])\s+\S/;
const HEADING = /^\s*#{1,6}\s+\S/;

export function countStructure(text: string): StructureCount {
  let listItems = 0;
  let headings = 0;

  for (const line of text.split("\n")) {
    // Un titre d'abord : `# Titre` n'est pas une puce, et le compter deux fois
    // ferait franchir le seuil à une sortie qui n'a rien ajouté de plus.
    if (HEADING.test(line)) {
      headings += 1;
      continue;
    }
    if (LIST_ITEM.test(line)) listItems += 1;
  }
  return { listItems, headings };
}

/**
 * Vrai quand la sortie s'est structurée bien au-delà de ce que le niveau
 * autorise.
 *
 * Le seuil dépend du niveau, comme celui de l'expansion : `complete` est fait
 * pour détailler, `minimal` est fait pour ne rien changer d'autre. Ce qui est
 * compté est ce que la sortie AJOUTE — une demande déjà écrite en liste peut
 * ressortir en liste sans que rien n'ait été inventé.
 */
export function isStructurallyInflated(
  input: string,
  output: string,
  level: RepromptLevel,
): boolean {
  const before = countStructure(input);
  const after = countStructure(output);
  const allowance = REPROMPT_POLICY.fidelity.structure.levels[level];

  return (
    after.listItems - before.listItems > allowance.addedListItems ||
    after.headings - before.headings > allowance.addedHeadings
  );
}
