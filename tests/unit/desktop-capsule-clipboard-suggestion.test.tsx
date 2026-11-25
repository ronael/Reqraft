/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EN, monterCapsule } from "./desktop-capsule-harness.js";

/**
 * Le secours du raccourci : quand rien n'a pu être capturé, la capsule
 * reprend le texte que l'utilisateur avait copié.
 *
 * Elle le propose sans l'envoyer. Le texte du presse-papiers peut être
 * n'importe quoi, et rien ne doit partir vers le modèle avant que
 * l'utilisateur ne le demande.
 */

const COPIED = "peux tu relire ce message avant que je l'envoie";

function champSaisie(): HTMLTextAreaElement {
  return screen.getByPlaceholderText<HTMLTextAreaElement>(EN["capsule.placeholder"]);
}

/** Le texte de la notice, tel qu'il se lit. */
function texteDeLaNotice(): string | null {
  return document.querySelector(".capsule-notice .inline-message-text")?.textContent ?? null;
}

afterEach(() => {
  cleanup();
});

describe("suggestion du texte copié", () => {
  it("remplit le champ avec le texte copié, sans rien envoyer", async () => {
    const harness = monterCapsule({
      capture: { empty: true, reason: "no selection", clipboardText: COPIED },
    });

    await waitFor(() => {
      expect(champSaisie().value).toBe(COPIED);
    });
    // La raison, devenue phrase, puis la suggestion : une seule notice qui se lit.
    expect(texteDeLaNotice()).toBe(`No selection. ${EN["capsule.clipboardSuggested"]}`);
    expect(harness.bridge.startReprompt).not.toHaveBeenCalled();
  });

  it("le reformule au raccourci de l'utilisateur", async () => {
    const harness = monterCapsule({
      capture: { empty: true, reason: "no selection", clipboardText: COPIED },
    });
    await waitFor(() => {
      expect(champSaisie().value).toBe(COPIED);
    });

    champSaisie().focus();
    await harness.user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
    });
    expect(harness.bridge.startReprompt.mock.calls[0]?.[0]).toMatchObject({ input: COPIED });
  });

  it("garde la raison seule quand le presse-papiers n'avait pas de texte", async () => {
    monterCapsule({ capture: { empty: true, reason: "no selection" } });

    await screen.findByText("No selection.");
    expect(texteDeLaNotice()).toBe("No selection.");
    expect(champSaisie().value).toBe("");
  });

  it("dit aussi pourquoi la capture a échoué quand une permission manque", async () => {
    const reason = "Accessibility access denied: allow Reqraft in System Settings";
    monterCapsule({
      capture: { empty: true, reason, permission: "accessibility", clipboardText: COPIED },
    });

    // La permission a sa propre notice (voir desktop-capsule-permission-notice) :
    // elle dit ce que macOS a bloqué, et que le champ tient le texte copié.
    await screen.findByText(EN["capsule.permission.captureBlocked"]);
    expect(texteDeLaNotice()).toContain(
      `${EN["capsule.permission.allowAccessibility"]} ${EN["capsule.permission.clipboardInField"]}`,
    );
    expect(champSaisie().value).toBe(COPIED);
  });
});
