/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  autoApplyDecision,
  isUserIntervention,
} from "@/apps/desktop/renderer/capsule/auto-apply.js";
import {
  arriveAuResultat,
  champResultat,
  EN,
  monterCapsule,
  repromptResult,
} from "./desktop-capsule-harness.js";

/**
 * Le raccourci de remplacement direct.
 *
 * Exercé dans la vraie capsule : ce qui compte est ce que le pont IPC reçoit,
 * c'est-à-dire ce que le processus principal collerait dans l'application
 * source — sans que personne n'ait appuyé sur ⏎.
 */

const MODEL_TEXT = "Fais un point sur l'avancement du projet demain matin.";
const DIRECT_REPLACE = { id: 1, mode: "capture", autoApply: true } as const;

afterEach(() => {
  cleanup();
});

describe("la capsule ouverte par le remplacement direct", () => {
  it("remplace dès que le résultat est prêt, sans ⏎", async () => {
    const harness = monterCapsule({ pending: DIRECT_REPLACE });

    await arriveAuResultat(harness, MODEL_TEXT);

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith(
        harness.dernierRunId(),
        "replace",
        undefined,
      );
    });
  });

  it("ne remplace pas un résultat à relire, et dit pourquoi", async () => {
    const harness = monterCapsule({ pending: DIRECT_REPLACE });
    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
    });
    const result = repromptResult(MODEL_TEXT);
    result.quality = {
      status: "review",
      signals: [
        {
          code: "missing_technical_terms",
          severity: "warning",
          params: { terms: ["parseResult"] },
        },
      ],
    };

    await waitFor(() => {
      harness.push.done({ runId: harness.dernierRunId(), result });
      expect(champResultat().value).toBe(MODEL_TEXT);
    });

    expect(await screen.findByText(EN["capsule.autoApplyReview"])).toBeDefined();
    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("une frappe pendant la génération rend la décision à ⏎", async () => {
    const harness = monterCapsule({ pending: DIRECT_REPLACE });
    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
    });

    fireEvent.keyDown(window, { key: "x" });
    await arriveAuResultat(harness, MODEL_TEXT);

    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("une capsule ordinaire attend toujours ⏎", async () => {
    const harness = monterCapsule();

    await arriveAuResultat(harness, MODEL_TEXT);

    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });
});

describe("la règle de décision", () => {
  const good = repromptResult(MODEL_TEXT);

  it("n'applique qu'un résultat complet, jugé bon, dans une session armée", () => {
    expect(autoApplyDecision({ armed: true, result: good })).toBe("apply");
    expect(autoApplyDecision({ armed: true, result: null })).toBe("wait");
    expect(autoApplyDecision({ armed: false, result: good })).toBe("wait");
  });

  it.each(["review", "risky"] as const)("laisse un résultat %s à relire", (status) => {
    const result = { ...good, quality: { status, signals: [] } };
    expect(autoApplyDecision({ armed: true, result })).toBe("review");
  });

  it("ignore les touches du raccourci encore enfoncées", () => {
    expect(isUserIntervention({ key: "R", repeat: true })).toBe(false);
    for (const key of ["Meta", "Control", "Shift", "Alt"]) {
      expect(isUserIntervention({ key, repeat: false })).toBe(false);
    }
  });

  it("prend toute autre frappe pour une reprise en main", () => {
    for (const key of ["Tab", "Escape", "Enter", "x"]) {
      expect(isUserIntervention({ key, repeat: false })).toBe(true);
    }
  });
});
