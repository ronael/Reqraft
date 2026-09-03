import { describe, expect, it } from "vitest";
import {
  CAPSULE_HEIGHT_STEP,
  CAPSULE_INPUT_HEIGHT,
  CAPSULE_MAX_HEIGHT,
  CAPSULE_MIN_HEIGHT,
  CAPSULE_RESERVED_HEIGHT,
  capsuleHeightFor,
  capsuleHeightPolicy,
  type CapsulePhase,
} from "@/apps/desktop/shared/capsule-geometry.js";
import { CAPSULE_STATES, type CapsuleState } from "@/apps/desktop/shared/capsule-machine.js";

/**
 * La règle de hauteur, exercée sur toute la table des états.
 *
 * Ce qui doit tenir n'est pas « la capsule s'adapte » mais « elle ne s'adapte
 * pas au mauvais moment ». Un état oublié du côté adaptatif suffit à faire
 * osciller la fenêtre pendant le streaming, et rien à l'écran ne dirait
 * pourquoi.
 */

function phase(state: CapsuleState, extra: Partial<CapsulePhase> = {}): CapsulePhase {
  return { state, picking: false, editing: false, ...extra };
}

describe("le régime de hauteur, état par état", () => {
  it("réserve la hauteur de travail pendant tout ce qui attend", () => {
    for (const state of ["capture", "analysis", "generating", "streaming"] as const) {
      expect(capsuleHeightPolicy(phase(state)), state).toBe("reserved");
    }
  });

  it("suit le contenu une fois qu'il ne bouge plus", () => {
    for (const state of ["input", "ready", "comparison", "error"] as const) {
      expect(capsuleHeightPolicy(phase(state)), state).toBe("adaptive");
    }
  });

  it("ne touche à rien pendant l'application ni une fois fermée", () => {
    // `applying` : le texte est parti, la fenêtre va disparaître. Bouger à cet
    // instant ferait sauter la capsule pile quand on attend un collage.
    for (const state of ["applying", "closed"] as const) {
      expect(capsuleHeightPolicy(phase(state)), state).toBe("hold");
    }
  });

  it("gèle la géométrie dès que le curseur est dans un champ", () => {
    // C'est la règle qui remplace le `ResizeObserver` du POC : la hauteur ne
    // dépend jamais du texte en cours de frappe, quel que soit l'état.
    for (const state of CAPSULE_STATES) {
      expect(capsuleHeightPolicy(phase(state, { editing: true })), state).toBe("hold");
    }
  });

  it("donne à la feuille de profils une boîte stable, pas celle du résultat", () => {
    // Une liste qui défile dans une capsule de 172 px serait inutilisable, et
    // la feuille ne change pas l'état de la machine.
    expect(capsuleHeightPolicy(phase("ready", { picking: true }))).toBe("reserved");
  });

  it("couvre chaque état de la machine sans exception", () => {
    for (const state of CAPSULE_STATES) {
      expect(["reserved", "adaptive", "hold"], state).toContain(capsuleHeightPolicy(phase(state)));
    }
  });
});

describe("la hauteur retenue pour une hauteur mesurée", () => {
  it("garde une hauteur normale telle quelle, au pas près", () => {
    expect(capsuleHeightFor(226)).toBe(228);
    expect(capsuleHeightFor(228)).toBe(228);
  });

  it("arrondit vers le haut : un demi-pixel manquant fait une barre de défilement", () => {
    expect(capsuleHeightFor(225.2)).toBe(228);
    expect(capsuleHeightFor(CAPSULE_MIN_HEIGHT + 0.1)).toBe(
      CAPSULE_MIN_HEIGHT + CAPSULE_HEIGHT_STEP,
    );
  });

  it("ne descend jamais sous le plancher, ni ne dépasse le plafond", () => {
    expect(capsuleHeightFor(10)).toBe(CAPSULE_MIN_HEIGHT);
    expect(capsuleHeightFor(0)).toBe(CAPSULE_MIN_HEIGHT);
    expect(capsuleHeightFor(5_000)).toBe(CAPSULE_MAX_HEIGHT);
  });

  it("se plie à un écran plus court que le plafond", () => {
    // Un portable 13" avec un Dock : la zone de travail commande, pas la
    // constante du produit.
    expect(capsuleHeightFor(1_000, 300)).toBe(300);
    expect(capsuleHeightFor(220, 300)).toBe(220);
  });

  it("refuse de descendre sous le plancher même sur un écran minuscule", () => {
    // Mieux vaut dépasser légèrement que rendre le pied inatteignable.
    expect(capsuleHeightFor(1_000, 40)).toBe(CAPSULE_MIN_HEIGHT);
  });

  it("retombe sur la hauteur de travail devant une mesure impossible", () => {
    // `getBoundingClientRect` peut rendre 0 sur un document détaché ; NaN vient
    // d'un `parseFloat` sur un style absent. Aucune des deux ne doit produire
    // une fenêtre absurde.
    expect(capsuleHeightFor(Number.NaN)).toBe(CAPSULE_RESERVED_HEIGHT);
    expect(capsuleHeightFor(Number.POSITIVE_INFINITY)).toBe(CAPSULE_RESERVED_HEIGHT);
  });

  it("est idempotente : reborner une hauteur déjà bornée ne la change pas", () => {
    // Le renderer borne, puis le processus principal reborne. Si les deux
    // passages ne donnaient pas le même nombre, la fenêtre se déplacerait à
    // chaque aller-retour.
    for (const natural of [100, 169, 203, 226, 442, 1_175]) {
      const once = capsuleHeightFor(natural);
      expect(capsuleHeightFor(once), String(natural)).toBe(once);
    }
  });
});

describe("les bornes entre elles", () => {
  it("laissent la hauteur de travail et celle de saisie dans l'intervalle", () => {
    for (const height of [CAPSULE_RESERVED_HEIGHT, CAPSULE_INPUT_HEIGHT]) {
      expect(height).toBeGreaterThanOrEqual(CAPSULE_MIN_HEIGHT);
      expect(height).toBeLessThanOrEqual(CAPSULE_MAX_HEIGHT);
    }
    expect(CAPSULE_MIN_HEIGHT).toBeLessThan(CAPSULE_MAX_HEIGHT);
  });

  it("posent des hauteurs d'ouverture déjà quantifiées", () => {
    // Sinon la première mesure du renderer demanderait aussitôt un pixel de
    // plus, et la fenêtre bougerait à l'ouverture pour rien.
    expect(capsuleHeightFor(CAPSULE_RESERVED_HEIGHT)).toBe(CAPSULE_RESERVED_HEIGHT);
    expect(capsuleHeightFor(CAPSULE_INPUT_HEIGHT)).toBe(CAPSULE_INPUT_HEIGHT);
  });
});
