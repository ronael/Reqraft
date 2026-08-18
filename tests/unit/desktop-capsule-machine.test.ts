import { describe, expect, it } from "vitest";
import {
  CAPSULE_STATES,
  interruptTarget,
  transition,
  type CapsuleEvent,
  type CapsuleState,
} from "@/apps/desktop/shared/capsule-machine.js";

/**
 * DESKTOP.md §8.2: the transition table is the spec. These tests walk every
 * row of it, plus the interruption nuance, and verify that anything outside
 * the table is refused.
 */
describe("machine à états de la capsule (DESKTOP.md §8.2)", () => {
  const TABLE: [CapsuleState, CapsuleEvent, CapsuleState][] = [
    ["fermée", "raccourci", "capture"],
    ["capture", "capturé", "analyse"],
    ["capture", "rien-à-capturer", "saisie"],
    ["saisie", "validation", "analyse"],
    ["analyse", "profil-détecté", "génération"],
    ["génération", "premier-fragment", "streaming"],
    ["génération", "résultat-complet", "prêt"],
    ["génération", "échec", "erreur"],
    ["streaming", "résultat-complet", "prêt"],
    ["streaming", "échec", "erreur"],
    ["prêt", "comparer", "comparaison"],
    ["comparaison", "fin-comparaison", "prêt"],
    ["prêt", "accepter", "application"],
    ["application", "appliqué", "fermée"],
    ["prêt", "relancer", "analyse"],
    ["prêt", "fermer", "fermée"],
    ["erreur", "fermer", "fermée"],
  ];

  it.each(TABLE)("%s + %s → %s", (from, event, expected) => {
    expect(transition(from, event)).toBe(expected);
  });

  it("toute transition absente de la table est refusée", () => {
    const events: CapsuleEvent[] = [
      "raccourci",
      "capturé",
      "rien-à-capturer",
      "validation",
      "profil-détecté",
      "premier-fragment",
      "résultat-complet",
      "interruption",
      "échec",
      "comparer",
      "fin-comparaison",
      "accepter",
      "appliqué",
      "relancer",
      "fermer",
    ];
    const allowed = new Set(TABLE.map(([from, event]) => `${from}|${event}`));

    for (const state of CAPSULE_STATES) {
      for (const event of events) {
        // `interruption` from génération/streaming is governed by
        // interruptTarget, not by the plain table.
        const governedByInterruptTarget =
          event === "interruption" && (state === "génération" || state === "streaming");
        if (!allowed.has(`${state}|${event}`) && !governedByInterruptTarget) {
          expect(transition(state, event), `${state} + ${event} doit être refusé`).toBeNull();
        }
      }
    }
  });

  it("interruption avec texte partiel → prêt, sinon → fermée", () => {
    expect(interruptTarget("streaming", true)).toBe("prêt");
    expect(interruptTarget("génération", true)).toBe("prêt");
    expect(interruptTarget("streaming", false)).toBe("fermée");
    expect(interruptTarget("génération", false)).toBe("fermée");
    expect(interruptTarget("prêt", true)).toBeNull();
    expect(interruptTarget("analyse", true)).toBeNull();
  });

  it("le trajet complet du produit est une chaîne valide", () => {
    const journey: [CapsuleEvent, CapsuleState][] = [
      ["raccourci", "capture"],
      ["capturé", "analyse"],
      ["profil-détecté", "génération"],
      ["premier-fragment", "streaming"],
      ["résultat-complet", "prêt"],
      ["comparer", "comparaison"],
      ["fin-comparaison", "prêt"],
      ["accepter", "application"],
      ["appliqué", "fermée"],
    ];
    let state: CapsuleState = "fermée";
    for (const [event, expected] of journey) {
      const next = transition(state, event);
      expect(next, `${state} + ${event}`).toBe(expected);
      state = expected;
    }
  });
});
