/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { arriveAuResultat, EN, monterCapsule } from "./desktop-capsule-harness.js";

/**
 * Une permission macOS refusée, à la capture ou au remplacement.
 *
 * La capsule dit ce que macOS a bloqué et quoi autoriser, puis ouvre le bon
 * volet des Réglages d'un clic. Elle ne recopie plus le chemin à parcourir à
 * la main.
 */

const COPIED = "peux tu relire ce message avant que je l'envoie";
const OPEN = EN["settings.remedy.openSystemSettings"];

afterEach(() => {
  cleanup();
});

describe("la notice d'une permission refusée", () => {
  it("à la capture, nomme le blocage et la case à cocher, et garde le texte copié", async () => {
    monterCapsule({
      capture: {
        empty: true,
        reason: "Automation access denied: allow Reqraft in System Settings",
        permission: "automation",
        clipboardText: COPIED,
      },
    });

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(EN["capsule.permission.captureBlocked"]);
    expect(alerte.textContent).toContain(EN["capsule.permission.allowAutomation"]);
    expect(alerte.textContent).toContain(EN["capsule.permission.clipboardInField"]);
    // The main process's sentence, with its path to retrace, is gone: the button leads there.
    expect(alerte.textContent).not.toContain("Automation access denied");
    expect(screen.getByRole("button", { name: OPEN })).toBeDefined();
  });

  it("ouvre le volet de cette permission, puis s'efface pour ne pas le couvrir", async () => {
    const harness = monterCapsule({
      capture: { empty: true, reason: "denied", permission: "automation" },
    });

    await harness.user.click(await screen.findByRole("button", { name: OPEN }));

    await waitFor(() => {
      expect(harness.closed).toHaveBeenCalledTimes(1);
    });
    expect(harness.bridge.openPermissionSettings).toHaveBeenCalledWith("automation");
  });

  it("reste ouverte, bouton rendu, quand le volet n'a pas pu s'ouvrir", async () => {
    const harness = monterCapsule({
      capture: { empty: true, reason: "denied", permission: "accessibility" },
    });
    harness.bridge.openPermissionSettings.mockRejectedValueOnce(new Error("ipc down"));

    const bouton = await screen.findByRole<HTMLButtonElement>("button", { name: OPEN });
    await harness.user.click(bouton);

    await waitFor(() => {
      expect(bouton.disabled).toBe(false);
    });
    expect(harness.bridge.openPermissionSettings).toHaveBeenCalledWith("accessibility");
    expect(harness.closed).not.toHaveBeenCalled();
  });

  it("une capture vide sans permission en cause n'offre aucun bouton", async () => {
    monterCapsule({ capture: { empty: true, reason: "no selection", clipboardText: COPIED } });

    await screen.findByText(`No selection. ${EN["capsule.clipboardSuggested"]}`);
    expect(screen.queryByRole("button", { name: OPEN })).toBeNull();
  });

  it("au remplacement refusé, reste ouverte sur le résultat copié, prête à réessayer", async () => {
    const harness = monterCapsule();
    harness.bridge.acceptResult.mockImplementation((_runId, mode) =>
      Promise.resolve(
        mode === "replace"
          ? { applied: false, reason: "denied", permission: "accessibility" as const }
          : { applied: true },
      ),
    );
    await arriveAuResultat(harness, "Relis ce message avant que je l'envoie.");

    await harness.user.keyboard("{Enter}");

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain(EN["capsule.permission.replaceBlocked"]);
    expect(alerte.textContent).toContain(EN["capsule.permission.allowAccessibility"]);
    expect(alerte.textContent).toContain(EN["capsule.permission.resultCopied"]);
    expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", undefined);
    expect(harness.closed).not.toHaveBeenCalled();

    // La permission accordée, ⏎ retente le remplacement.
    await harness.user.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        harness.bridge.acceptResult.mock.calls.filter(([, mode]) => mode === "replace"),
      ).toHaveLength(2);
    });
  });
});
