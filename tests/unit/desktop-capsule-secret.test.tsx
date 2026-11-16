/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { UiError } from "@/apps/desktop/shared/ipc-contract.js";
import {
  champResultat,
  DEFAULT_CAPTURE_TEXT,
  EN,
  monterCapsule,
  pousserResultat,
  uiError,
  type CapsuleHarness,
} from "./desktop-capsule-harness.js";

/**
 * Un texte refusé pour un secret.
 *
 * Le refus ne laissait que esc : la capsule disait de passer
 * `--redact-secrets` ou `--force`, deux options du CLI qu'aucune fenêtre ne
 * propose. Elle offre maintenant de masquer et de continuer, c'est-à-dire de
 * renvoyer la même demande avec `redactSecrets`.
 */

afterEach(cleanup);

const SECRET_REFUSAL: UiError = {
  title: EN["main.secretDetectedTitle"],
  message: EN["main.secretDetected"],
  nextAction: EN["main.secretDetectedAction"],
};

const masquer = (): HTMLElement | null =>
  screen.queryByRole("button", { name: EN["capsule.redactAndContinue"] });

/** Laisse partir la capture, puis refuse son run. */
async function refuser(
  harness: CapsuleHarness,
  error: UiError,
  canRedactSecrets = false,
): Promise<void> {
  await waitFor(() => {
    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    harness.push.error({ runId: harness.dernierRunId(), error, canRedactSecrets });
    expect(screen.getByRole("alert").textContent).toContain(error.message);
  });
}

it("offers to redact a refused secret, and sends the same request again, masked", async () => {
  const harness = monterCapsule();
  await refuser(harness, SECRET_REFUSAL, true);
  expect(screen.getByRole("alert").textContent).toContain(EN["main.secretDetectedAction"]);

  const action = masquer();
  expect(action).not.toBeNull();
  if (action !== null) await harness.user.click(action);

  expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(2);
  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: DEFAULT_CAPTURE_TEXT,
    level: "standard",
    redactSecrets: true,
  });
  await pousserResultat(harness, "Fais un point demain sur le projet.");
  expect(champResultat().value).toBe("Fais un point demain sur le projet.");
  expect(masquer()).toBeNull();
});

it("offers nothing to redact after another error", async () => {
  const harness = monterCapsule();
  await refuser(harness, uiError("provider unavailable"));

  expect(masquer()).toBeNull();
});
