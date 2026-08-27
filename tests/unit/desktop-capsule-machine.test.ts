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
    ["closed", "shortcut", "capture"],
    ["capture", "captured", "analysis"],
    ["capture", "nothing-to-capture", "input"],
    ["input", "submitted", "analysis"],
    ["analysis", "run-accepted", "generating"],
    ["analysis", "failed", "error"],
    ["generating", "first-chunk", "streaming"],
    ["generating", "result-complete", "ready"],
    ["generating", "failed", "error"],
    ["streaming", "result-complete", "ready"],
    ["streaming", "failed", "error"],
    ["ready", "compare", "comparison"],
    ["comparison", "compare-end", "ready"],
    ["comparison", "rerun", "analysis"],
    ["ready", "accept", "applying"],
    ["applying", "applied", "closed"],
    ["applying", "failed", "ready"],
    ["ready", "rerun", "analysis"],
    ["ready", "close", "closed"],
    ["error", "close", "closed"],
  ];

  it.each(TABLE)("%s + %s → %s", (from, event, expected) => {
    expect(transition(from, event)).toBe(expected);
  });

  it("tout état qui attend une réponse asynchrone accepte un échec", () => {
    // C'est l'invariant que deux culs-de-sac successifs ont violé : `analysis`
    // attendait `reprompt:start` et `applying` attendait `result:accept`, sans
    // qu'un refus ait où aller. Le renderer envoyait bien `failed`, la table
    // le refusait, et la capsule restait sur un sablier ou un pied vide.
    for (const state of ["analysis", "generating", "streaming", "applying"] as const) {
      expect(transition(state, "failed"), `${state} n'a pas de sortie d'échec`).not.toBeNull();
    }
  });

  it("un remplacement refusé rend la main au lieu de bloquer la capsule", () => {
    // `applying` n'avait qu'une sortie, `applied`. Une permission macOS
    // refusée ou une application source qui ne revient pas y laissait la
    // capsule pour toujours : le pied ne rend ses touches que sur `ready` et
    // `comparison`, donc ⏎, ⌘C, ⌘R et ⇥ devenaient tous inertes. De
    // l'extérieur, « le remplacement ne fait rien ».
    expect(transition("applying", "failed")).toBe("ready");
  });

  it("toute transition absente de la table est refusée", () => {
    const events: CapsuleEvent[] = [
      "shortcut",
      "captured",
      "nothing-to-capture",
      "submitted",
      "run-accepted",
      "first-chunk",
      "result-complete",
      "interrupted",
      "failed",
      "compare",
      "compare-end",
      "accept",
      "applied",
      "rerun",
      "close",
    ];
    const allowed = new Set(TABLE.map(([from, event]) => `${from}|${event}`));

    for (const state of CAPSULE_STATES) {
      for (const event of events) {
        // `interrupted` from generating/streaming is governed by
        // interruptTarget, not by the plain table.
        const governedByInterruptTarget =
          event === "interrupted" && (state === "generating" || state === "streaming");
        if (!allowed.has(`${state}|${event}`) && !governedByInterruptTarget) {
          expect(transition(state, event), `${state} + ${event} doit être refusé`).toBeNull();
        }
      }
    }
  });

  it("interrupted avec texte partiel → ready, sinon → closed", () => {
    expect(interruptTarget("streaming", true)).toBe("ready");
    expect(interruptTarget("generating", true)).toBe("ready");
    expect(interruptTarget("streaming", false)).toBe("closed");
    expect(interruptTarget("generating", false)).toBe("closed");
    expect(interruptTarget("ready", true)).toBeNull();
    expect(interruptTarget("analysis", true)).toBeNull();
  });

  it("le trajet complet du produit est une chaîne valide", () => {
    const journey: [CapsuleEvent, CapsuleState][] = [
      ["shortcut", "capture"],
      ["captured", "analysis"],
      ["run-accepted", "generating"],
      ["first-chunk", "streaming"],
      ["result-complete", "ready"],
      ["compare", "comparison"],
      ["compare-end", "ready"],
      ["accept", "applying"],
      ["applied", "closed"],
    ];
    let state: CapsuleState = "closed";
    for (const [event, expected] of journey) {
      const next = transition(state, event);
      expect(next, `${state} + ${event}`).toBe(expected);
      state = expected;
    }
  });
});
