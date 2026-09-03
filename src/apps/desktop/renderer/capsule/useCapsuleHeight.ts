import { useLayoutEffect } from "react";
import {
  CAPSULE_RESERVED_HEIGHT,
  capsuleHeightFor,
  capsuleHeightPolicy,
} from "@/apps/desktop/shared/capsule-geometry.js";
import type { CapsuleState } from "@/apps/desktop/shared/capsule-machine.js";

/**
 * La capsule demande sa hauteur, et seulement quand son contenu s'est posé.
 *
 * Le POC branchait un `ResizeObserver` sur le corps : il voit chaque fragment
 * de streaming et chaque frappe, donc la fenêtre suivait le texte lettre par
 * lettre. C'est précisément ce que DESKTOP.md §4.3 interdit, et c'est pour
 * cela que la hauteur avait fini figée à 380 px.
 *
 * La décision est ici déterministe et discrète : elle ne dépend que de l'état
 * de la capsule, de la présence du curseur dans un champ, et de l'identité du
 * contenu reçu — le résultat, une note, une erreur. Le texte lui-même n'y
 * figure jamais : tant qu'on écrit, la géométrie est gelée et le corps défile.
 * La capsule se réajuste une seule fois, quand le champ rend la main.
 *
 * La mesure elle-même est prise dans un `useLayoutEffect`, donc après le rendu
 * et avant la peinture : la hauteur envoyée est celle du contenu réellement
 * mis en page, jamais une estimation à partir d'un nombre de caractères.
 */

export interface CapsuleHeightInput {
  readonly state: CapsuleState;
  /** La feuille de profils recouvre le corps sans changer l'état. */
  readonly picking: boolean;
  /** Le curseur est dans un champ : la géométrie est gelée jusqu'au relâchement. */
  readonly editing: boolean;
  /**
   * Ce qui, à état constant, change la hauteur du contenu.
   *
   * Des valeurs d'état React, donc d'identité stable entre deux rendus : elles
   * servent de dépendances telles quelles. Ce qui n'y est pas est ce qui ne
   * doit jamais redimensionner la fenêtre.
   */
  readonly result: unknown;
  readonly notice: unknown;
  readonly error: unknown;
}

/**
 * La hauteur que le contenu occuperait sans borne, mesurée dans le document.
 *
 * `.capsule-content` est un bloc intrinsèque : sa hauteur est celle de son
 * contenu, alors que `.capsule-body` — qui est le `flex: 1` de la capsule —
 * rend toujours la hauteur qu'on lui a laissée. Mesurer le second au lieu du
 * premier rendrait l'ancienne hauteur, et la capsule ne rétrécirait jamais.
 *
 * `null` quand la capsule n'a pas de corps mesurable : on préfère ne rien
 * demander plutôt que demander une valeur inventée.
 */
export function measureCapsuleHeight(): number | null {
  const body = document.querySelector(".capsule-body");
  const content = body?.querySelector(":scope > .capsule-content") ?? null;
  if (body === null || content === null) return null;
  const styles = window.getComputedStyle(body);
  const padding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  // Tout ce qui n'est pas le corps — bandeau, barre d'activité, pied — se
  // déduit de la différence, sans avoir à énumérer les pièces.
  const outside = window.innerHeight - body.clientHeight;
  return outside + content.getBoundingClientRect().height + padding;
}

export function useCapsuleHeight({
  state,
  picking,
  editing,
  result,
  notice,
  error,
}: CapsuleHeightInput): void {
  useLayoutEffect(() => {
    const policy = capsuleHeightPolicy({ state, picking, editing });
    if (policy === "hold") return;
    const natural = policy === "reserved" ? CAPSULE_RESERVED_HEIGHT : measureCapsuleHeight();
    if (natural === null) return;
    // Le processus principal borne à nouveau : lui seul connaît la zone de
    // travail. Un échec ne doit pas casser la capsule — au pire elle garde la
    // hauteur qu'elle a.
    void window.reqraft.resizeCapsule(capsuleHeightFor(natural)).catch(() => undefined);
  }, [state, picking, editing, result, notice, error]);
}
