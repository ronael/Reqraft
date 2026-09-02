import { describe, expect, it } from "vitest";
import { cycleRepromptLevel } from "@/apps/desktop/renderer/capsule/App.js";
import {
  comparisonEvent,
  keepsComparison,
  NO_COMPARISON,
  preventsBrowserDefault,
  reduceComparison,
  resolveCapsuleKeyDown,
  resolveCapsuleKeyUp,
  wantsComparison,
  type CapsuleIntent,
  type CapsuleKeyContext,
  type CapsuleKeyStroke,
  type ComparisonIntent,
} from "@/apps/desktop/renderer/capsule/keyboard.js";
import {
  CAPSULE_STATES,
  transition,
  type CapsuleState,
} from "@/apps/desktop/shared/capsule-machine.js";

/**
 * Le clavier de la capsule.
 *
 * Ces règles vivaient dans un `onKeyDown` du renderer, où la suite — qui tourne
 * sous Node, sans DOM — ne pouvait que relire la source. Un test qui cherche
 * `event.shiftKey` dans un fichier passe aussi bien quand la touche est câblée
 * que quand elle est câblée à l'envers. Ici les fonctions sont appelées.
 */

/**
 * La frappe telle qu'elle arrive hors du champ d'édition.
 *
 * C'est le contexte de toutes les règles ci-dessous, sauf celles qui portent
 * justement sur l'édition. Le nommer une fois évite de le répéter à chaque
 * appel, et laisse voir d'un coup d'œil les cas qui s'en écartent.
 */
function touche(stroke: CapsuleKeyStroke, state: CapsuleState): CapsuleIntent | null {
  return resolveCapsuleKeyDown(stroke, { state, editing: false });
}

function coupeLeDefaut(stroke: CapsuleKeyStroke, state: CapsuleState): boolean {
  return preventsBrowserDefault(stroke, { state, editing: false });
}

/** Les seuls états où le pied de la capsule rend ses commandes. */
const AVEC_COMMANDES: readonly CapsuleState[] = ["ready", "comparison"];
const SANS_COMMANDES = CAPSULE_STATES.filter((state) => !AVEC_COMMANDES.includes(state));

describe("les touches de niveau", () => {
  it.each(AVEC_COMMANDES)("⇥ avance d'un niveau depuis %s", (state) => {
    expect(touche({ key: "Tab" }, state)).toBe("level-next");
  });

  it.each(AVEC_COMMANDES)("⇧⇥ recule d'un niveau depuis %s", (state) => {
    expect(touche({ key: "Tab", shiftKey: true }, state)).toBe("level-previous");
  });

  it("les deux sens parcourent le cycle en sens inverse l'un de l'autre", () => {
    // Le lien entre la commande et le sens est la seule ligne que le renderer
    // ajoute ; la reproduire ici garde la vérification de bout en bout.
    const sens: Record<"level-next" | "level-previous", 1 | -1> = {
      "level-next": 1,
      "level-previous": -1,
    };
    const avance = (level: "minimal" | "standard" | "complete", shiftKey: boolean) => {
      const intent = touche({ key: "Tab", shiftKey }, "ready");
      expect(intent === "level-next" || intent === "level-previous").toBe(true);
      return cycleRepromptLevel(level, sens[intent as "level-next" | "level-previous"]);
    };

    expect(avance("minimal", false)).toBe("standard");
    expect(avance("standard", false)).toBe("complete");
    expect(avance("complete", false)).toBe("minimal");

    expect(avance("minimal", true)).toBe("complete");
    expect(avance("standard", true)).toBe("minimal");
    expect(avance("complete", true)).toBe("standard");
  });

  it("⌘⇥ appartient au système et ne change pas de niveau", () => {
    expect(touche({ key: "Tab", metaKey: true }, "ready")).toBeNull();
  });

  it.each(SANS_COMMANDES)("⇥ et ⇧⇥ sont inertes pendant %s", (state) => {
    expect(touche({ key: "Tab" }, state)).toBeNull();
    expect(touche({ key: "Tab", shiftKey: true }, state)).toBeNull();
  });

  it("les deux sens coupent le comportement du navigateur", () => {
    // Sans cela ⇥ déplace le focus dans la fenêtre et ⇧⇥ le remonte : le
    // niveau change ET le focus part, ce qui rend l'appui suivant imprévisible.
    expect(coupeLeDefaut({ key: "Tab" }, "ready")).toBe(true);
    expect(coupeLeDefaut({ key: "Tab", shiftKey: true }, "ready")).toBe(true);
  });
});

describe("⌘D, la comparaison épinglée", () => {
  it.each(AVEC_COMMANDES)("est reconnu depuis %s", (state) => {
    expect(touche({ key: "d", metaKey: true }, state)).toBe("pin-comparison");
  });

  it("survit au verrou majuscules", () => {
    expect(touche({ key: "D", metaKey: true }, "ready")).toBe("pin-comparison");
  });

  it("n'est pas le « d » nu, qui n'a rien à faire là", () => {
    expect(touche({ key: "d" }, "ready")).toBeNull();
  });

  it.each(SANS_COMMANDES)("est inerte pendant %s", (state) => {
    expect(touche({ key: "d", metaKey: true }, state)).toBeNull();
  });

  it("coupe le signet du navigateur", () => {
    expect(coupeLeDefaut(CMD_D, "ready")).toBe(true);
  });

  it("ne rebascule pas quand l'appui est tenu", () => {
    // Le système répète le `keydown` tant que la touche est enfoncée. Chaque
    // répétition inverserait l'épinglage : la comparaison clignoterait, et
    // l'état final dépendrait de la durée de l'appui.
    expect(touche({ ...CMD_D, repeat: true }, "ready")).toBeNull();
    expect(touche({ ...CMD_D, repeat: true }, "comparison")).toBeNull();
  });

  it("reste retiré au navigateur pendant la répétition", () => {
    // La répétition n'exécute plus rien, mais elle reste une frappe de la
    // capsule : la laisser passer rendrait le signet au milieu d'un appui tenu.
    expect(coupeLeDefaut({ ...CMD_D, repeat: true }, "ready")).toBe(true);
  });
});

describe("les autres commandes du pied", () => {
  it("garde le contrat existant", () => {
    expect(touche({ key: "Enter" }, "ready")).toBe("accept");
    expect(touche({ key: "c", metaKey: true }, "ready")).toBe("copy");
    expect(touche({ key: "r", metaKey: true }, "ready")).toBe("rerun");
    expect(touche({ key: "Alt" }, "ready")).toBe("hold-comparison");
  });

  it("laisse ⌘⏎ au champ de saisie", () => {
    // Le textarea de l'état `input` valide avec ⌘⏎ ; le remplacement est ⏎ nu.
    expect(touche({ key: "Enter", metaKey: true }, "ready")).toBeNull();
  });

  it.each(CAPSULE_STATES)("esc ferme et ⌘. interrompt depuis %s", (state) => {
    // Ces deux-là passent avant la porte des états : une capsule qui travaille
    // doit rester interruptible et fermable.
    expect(touche({ key: "Escape" }, state)).toBe("close");
    expect(touche({ key: ".", metaKey: true }, state)).toBe("cancel");
  });

  it("ne coupe pas le navigateur là où il n'y a rien à couper", () => {
    const inoffensives: CapsuleKeyStroke[] = [
      { key: "Enter" },
      { key: "c", metaKey: true },
      { key: "Escape" },
      { key: ".", metaKey: true },
      { key: "Alt" },
    ];
    for (const stroke of inoffensives) {
      expect(coupeLeDefaut(stroke, "ready"), stroke.key).toBe(false);
    }
  });

  it("garde la répétition des commandes qui ne basculent rien", () => {
    // Historique préservé : ces commandes redemandent la même chose, elles ne
    // s'inversent pas. Seul ⌘D avait besoin d'être protégé.
    const repetables: [CapsuleKeyStroke, CapsuleIntent][] = [
      [{ key: "Tab" }, "level-next"],
      [{ key: "Tab", shiftKey: true }, "level-previous"],
      [{ key: "r", metaKey: true }, "rerun"],
      [{ key: "c", metaKey: true }, "copy"],
      [{ key: "Enter" }, "accept"],
      [{ key: "Escape" }, "close"],
      [{ key: ".", metaKey: true }, "cancel"],
      [{ key: "Alt" }, "hold-comparison"],
    ];
    for (const [stroke, intent] of repetables) {
      expect(touche({ ...stroke, repeat: true }, "ready"), stroke.key).toBe(intent);
    }
  });

  it("le relâchement de ⌥ est entendu quel que soit l'état", () => {
    // Filtrer par état laisserait le maintien allumé si la capsule change
    // d'état entre l'appui et le relâchement.
    for (const state of CAPSULE_STATES) {
      expect(touche({ key: "Alt" }, state)).toBe(
        AVEC_COMMANDES.includes(state) ? "hold-comparison" : null,
      );
    }
    expect(resolveCapsuleKeyUp({ key: "Alt" })).toBe("release-comparison");
    expect(resolveCapsuleKeyUp({ key: "d", metaKey: true })).toBeNull();
  });
});

/**
 * Le renderer, réduit à ce que ces fonctions décident.
 *
 * Le câblage réel est un effet qui réaligne la machine sur l'intention et
 * efface l'épinglage dès que la capsule quitte les états où l'« avant/après »
 * existe encore. Le rejouer ici avec les mêmes fonctions vérifie la
 * composition, pas une paraphrase.
 */
interface Capsule {
  readonly state: CapsuleState;
  readonly comparison: ComparisonIntent;
}

function reglerLaComparaison(capsule: Capsule): Capsule {
  if (!keepsComparison(capsule.state)) {
    return { state: capsule.state, comparison: NO_COMPARISON };
  }
  const event = comparisonEvent(capsule.state, wantsComparison(capsule.comparison));
  if (event === null) return capsule;
  return {
    state: transition(capsule.state, event) ?? capsule.state,
    comparison: capsule.comparison,
  };
}

function appliquer(capsule: Capsule, intent: CapsuleIntent): Capsule {
  return reglerLaComparaison({
    state: capsule.state,
    comparison: reduceComparison(capsule.comparison, intent),
  });
}

function frapper(capsule: Capsule, stroke: CapsuleKeyStroke): Capsule {
  const intent = touche(stroke, capsule.state);
  return intent === null ? capsule : appliquer(capsule, intent);
}

function relacher(capsule: Capsule, stroke: CapsuleKeyStroke): Capsule {
  const intent = resolveCapsuleKeyUp(stroke);
  return intent === null ? capsule : appliquer(capsule, intent);
}

/** Un événement venu du reste de l'application (run, remplacement, capture). */
function subir(capsule: Capsule, event: Parameters<typeof transition>[1]): Capsule {
  return reglerLaComparaison({
    state: transition(capsule.state, event) ?? capsule.state,
    comparison: capsule.comparison,
  });
}

const DEVANT_UN_RESULTAT: Capsule = { state: "ready", comparison: NO_COMPARISON };
const CMD_D: CapsuleKeyStroke = { key: "d", metaKey: true };
const OPTION: CapsuleKeyStroke = { key: "Alt" };

describe("⌥ maintenu et ⌘D épinglé, ensemble", () => {
  it("⌥ compare le temps de l'appui, et rend la main au relâchement", () => {
    const maintenu = frapper(DEVANT_UN_RESULTAT, OPTION);
    expect(maintenu.state).toBe("comparison");

    expect(relacher(maintenu, OPTION).state).toBe("ready");
  });

  it("⌘D compare sans rien maintenir, et une seconde fois referme", () => {
    const epingle = frapper(DEVANT_UN_RESULTAT, CMD_D);
    expect(epingle.state).toBe("comparison");
    expect(epingle.comparison.pinned).toBe(true);

    expect(frapper(epingle, CMD_D).state).toBe("ready");
  });

  it("relâcher ⌥ ne défait pas un épinglage", () => {
    // Le cas qui a motivé la séparation des deux voies : avec un seul booléen,
    // un ⌥ effleuré pendant une comparaison épinglée la refermait.
    const epingle = frapper(DEVANT_UN_RESULTAT, CMD_D);
    const puisMaintenu = frapper(epingle, OPTION);
    expect(puisMaintenu.state).toBe("comparison");

    const relache = relacher(puisMaintenu, OPTION);
    expect(relache.state).toBe("comparison");
    expect(relache.comparison.pinned).toBe(true);
  });

  it("épingler pendant un maintien garde la comparaison après le relâchement", () => {
    const maintenu = frapper(DEVANT_UN_RESULTAT, OPTION);
    const epingle = frapper(maintenu, CMD_D);

    expect(relacher(epingle, OPTION).state).toBe("comparison");
  });

  it("un appui tenu sur ⌘D épingle une fois, pas une fois par répétition", () => {
    // Le bug que la répétition produisait : garder ⌘D une seconde suffisait à
    // enchaîner assez de bascules pour finir dés-épinglé, au hasard de la durée.
    let capsule = frapper(DEVANT_UN_RESULTAT, CMD_D);
    for (let i = 0; i < 7; i += 1) {
      capsule = frapper(capsule, { ...CMD_D, repeat: true });
    }

    expect(capsule.state).toBe("comparison");
    expect(capsule.comparison.pinned).toBe(true);
  });

  it("un appui tenu sur ⌥ ne remue rien non plus", () => {
    const maintenu = frapper(DEVANT_UN_RESULTAT, OPTION);
    const repete = frapper(maintenu, { ...OPTION, repeat: true });

    // Même valeur ET même identité : le renderer garde cette intention dans un
    // état React, une nouvelle identité par répétition relancerait un rendu.
    expect(repete.comparison).toBe(maintenu.comparison);
    expect(repete.state).toBe("comparison");
  });

  it("⌘D tenu pendant que ⌥ est maintenu laisse un épinglage propre", () => {
    // Les deux voies se croisent ici : sans le filtre, les répétitions
    // inversaient `pinned` sous un `holding` qui, lui, ne bougeait pas — et le
    // relâchement de ⌥ décidait du résultat.
    let capsule = frapper(frapper(DEVANT_UN_RESULTAT, OPTION), CMD_D);
    for (let i = 0; i < 4; i += 1) {
      capsule = frapper(capsule, { ...CMD_D, repeat: true });
    }

    expect(capsule.comparison).toEqual({ holding: true, pinned: true });
    expect(relacher(capsule, OPTION).state).toBe("comparison");
  });

  it("dés-épingler pendant un maintien laisse ⌥ commander", () => {
    const maintenuEtEpingle = frapper(frapper(DEVANT_UN_RESULTAT, OPTION), CMD_D);
    const desepingle = frapper(maintenuEtEpingle, CMD_D);

    expect(desepingle.state).toBe("comparison");
    expect(relacher(desepingle, OPTION).state).toBe("ready");
  });
});

describe("l'épinglage ne survit pas à un « avant » périmé", () => {
  it("une nouvelle génération le retire, et le résultat suivant arrive nu", () => {
    // ⌘R, ⇥ et le choix d'un profil passent tous par `rerun`. L'« avant »
    // affiché est l'entrée du run montré : sur le run suivant, la paire ne
    // veut plus rien dire.
    const epingle = frapper(DEVANT_UN_RESULTAT, CMD_D);
    const relance = subir(epingle, "rerun");

    expect(relance.state).toBe("analysis");
    expect(relance.comparison).toEqual(NO_COMPARISON);

    const suite = subir(subir(subir(relance, "run-accepted"), "first-chunk"), "result-complete");
    expect(suite.state).toBe("ready");
  });

  it("un remplacement appliqué le retire", () => {
    const epingle = frapper(DEVANT_UN_RESULTAT, CMD_D);
    const remplacement = subir(epingle, "accept");
    expect(remplacement.state).toBe("applying");
    // Toujours épinglé pendant le remplacement : le résultat est encore là, et
    // le remplacement peut être refusé.
    expect(remplacement.comparison.pinned).toBe(true);

    const applique = subir(remplacement, "applied");
    expect(applique.state).toBe("closed");
    expect(applique.comparison).toEqual(NO_COMPARISON);
  });

  it("un remplacement refusé rend la comparaison épinglée, pas un écran mort", () => {
    // ⏎ depuis une comparaison épinglée est le trajet normal depuis ⌘D. Sans
    // la sortie `comparison → applying`, l'échec n'avait aucun état où
    // retomber et la capsule restait figée.
    const epingle = frapper(DEVANT_UN_RESULTAT, CMD_D);
    const refuse = subir(subir(epingle, "accept"), "failed");

    expect(refuse.state).toBe("comparison");
    expect(refuse.comparison.pinned).toBe(true);
  });

  it("la fermeture le retire, capsule cachée puis rouverte comprise", () => {
    // `esc` pose l'état directement — la fenêtre persiste entre deux
    // déclenchements, cachée plutôt que détruite, donc l'épinglage d'une
    // session survivrait à la suivante s'il n'était pas effacé ici.
    const epingle = frapper(DEVANT_UN_RESULTAT, CMD_D);
    const fermee = reglerLaComparaison({ state: "closed", comparison: epingle.comparison });

    expect(fermee.comparison).toEqual(NO_COMPARISON);

    const reouverte = subir(fermee, "shortcut");
    expect(reouverte.state).toBe("capture");
    expect(reouverte.comparison).toEqual(NO_COMPARISON);
  });

  it("ne s'installe pas pendant que la capsule travaille", () => {
    const pendantLaGeneration: Capsule = { state: "generating", comparison: NO_COMPARISON };

    expect(frapper(pendantLaGeneration, CMD_D)).toEqual(pendantLaGeneration);
    expect(frapper(pendantLaGeneration, OPTION)).toEqual(pendantLaGeneration);
  });

  it("aucun état hors résultat ne garde une comparaison", () => {
    for (const state of CAPSULE_STATES) {
      const garde = keepsComparison(state);
      expect(garde, state).toBe(
        state === "ready" || state === "comparison" || state === "applying",
      );
    }
  });
});

/**
 * Le clavier pendant qu'on reprend le résultat.
 *
 * Le résultat final est devenu un champ. Sans cette porte, écrire dedans était
 * impossible : `⏎` remplaçait la sélection au lieu d'ajouter une ligne, `⇥`
 * relançait une génération au lieu de sortir du champ, `⌘C` copiait tout le
 * résultat au lieu de la sélection, et `⌘R` jetait ce qui venait d'être écrit.
 */
describe("l'édition du résultat rend ses touches au champ", () => {
  const EN_EDITION: CapsuleKeyContext = { state: "ready", editing: true };

  it.each<[string, CapsuleKeyStroke]>([
    ["⏎", { key: "Enter" }],
    ["⇥", { key: "Tab" }],
    ["⇧⇥", { key: "Tab", shiftKey: true }],
    ["⌘C", { key: "c", metaKey: true }],
    ["⌘R", { key: "r", metaKey: true }],
    ["⌘D", { key: "d", metaKey: true }],
    ["⌥", { key: "Alt" }],
  ])("%s ne déclenche plus la commande de la capsule", (_nom, stroke) => {
    expect(resolveCapsuleKeyDown(stroke, EN_EDITION)).toBeNull();
  });

  it.each<[string, CapsuleKeyStroke]>([
    ["⇥", { key: "Tab" }],
    ["⌘R", { key: "r", metaKey: true }],
    ["⌘D", { key: "d", metaKey: true }],
  ])("%s garde le comportement natif du navigateur", (_nom, stroke) => {
    // La capsule coupait ces frappes pour s'en servir. Continuer à les couper
    // pendant l'édition les rendrait inertes : ni commande, ni frappe.
    expect(preventsBrowserDefault(stroke, EN_EDITION)).toBe(false);
    expect(preventsBrowserDefault(stroke, { state: "ready", editing: false })).toBe(true);
  });

  it("esc ferme toujours, et ⌘. interrompt toujours", () => {
    // Les deux seules commandes qui ne dépendent d'aucun état : une capsule
    // dont on ne peut plus sortir parce que le curseur est dans un champ
    // serait un piège.
    expect(resolveCapsuleKeyDown({ key: "Escape" }, EN_EDITION)).toBe("close");
    expect(resolveCapsuleKeyDown({ key: ".", metaKey: true }, EN_EDITION)).toBe("cancel");
  });

  it("le relâchement de ⌥ reste écouté, quel qu'ait été l'appui", () => {
    // `resolveCapsuleKeyUp` ne regarde ni l'état ni l'édition : un maintien
    // commencé avant le clic dans le champ doit pouvoir se relâcher.
    expect(resolveCapsuleKeyUp({ key: "Alt" })).toBe("release-comparison");
  });

  it("les commandes reviennent dès que le champ rend la main", () => {
    expect(resolveCapsuleKeyDown({ key: "Enter" }, { state: "ready", editing: false })).toBe(
      "accept",
    );
  });
});
