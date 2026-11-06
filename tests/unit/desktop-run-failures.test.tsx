// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  RepromptStartRequest,
  RepromptStartResponse,
} from "@/apps/desktop/shared/ipc-contract.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";
import { createTranslator } from "@/i18n/translate.js";
import { arriveAuResultat, commande, EN, monterCapsule } from "./desktop-capsule-harness.js";
import {
  corrompreLaConfiguration,
  dependancesSansTrousseau,
  joindreProcessusPrincipal,
} from "./desktop-main-process.js";
import { champPrompt, monterPopover } from "./desktop-popover-harness.js";

/**
 * Ce que la capsule et le popover disent quand le processus principal refuse.
 *
 * Un appel refusé revient dans le cadre d'Electron : « Error invoking remote
 * method '…': Error: … ». La phrase qui suit a été écrite par le processus
 * principal pour être lue ; le cadre, lui, n'est que le transport.
 */

const t = createDesktopTranslator("en");
/** Le catalogue partagé, où le processus principal prend la phrase des erreurs. */
const tPartage = createTranslator("en");

afterEach(() => {
  cleanup();
});

/** `reprompt:start`, tel que le vrai processus principal y répond quand la configuration est corrompue. */
async function demarrageImpossible(): Promise<{
  phrase: string;
  demarrer: (requete: RepromptStartRequest) => Promise<RepromptStartResponse>;
}> {
  const fichier = await corrompreLaConfiguration();
  const principal = joindreProcessusPrincipal(dependancesSansTrousseau());
  return {
    phrase: tPartage("error.config.invalid", { path: fichier }),
    demarrer: (requete) =>
      principal(IPC_CHANNELS.repromptStart, requete) as Promise<RepromptStartResponse>,
  };
}

describe("un run qui ne peut pas partir", () => {
  it("se lit dans la capsule sans le cadre IPC", async () => {
    const { phrase, demarrer } = await demarrageImpossible();
    const capsule = monterCapsule();
    // Posé avant que la capture ne lance le run : celui-ci attend des
    // promesses que le test n'a pas encore laissé se résoudre.
    capsule.bridge.startReprompt.mockImplementationOnce(demarrer);

    expect(await screen.findByText(phrase)).toBeTruthy();
  });

  it("se lit dans le popover sans le cadre IPC", async () => {
    const { phrase, demarrer } = await demarrageImpossible();
    const popover = await monterPopover();
    popover.bridge.startReprompt.mockImplementationOnce(demarrer);

    await popover.user.type(champPrompt(), "Corrige le titre de la page.");
    await popover.user.click(commande(EN["capsule.reformulate"]));

    expect(await screen.findByText(phrase)).toBeTruthy();
  });
});

describe("un remplacement refusé par le processus principal", () => {
  it("dit pourquoi dans la capsule, sans le cadre IPC", async () => {
    const capsule = monterCapsule();
    await arriveAuResultat(capsule, "Peux-tu me faire un point demain sur le projet ?");
    const raison = "The source application has quit.";
    capsule.bridge.acceptResult.mockRejectedValueOnce(
      new Error(`Error invoking remote method '${IPC_CHANNELS.resultAccept}': Error: ${raison}`),
    );

    await capsule.user.click(commande(EN["capsule.replace"]));

    await waitFor(() => {
      expect(document.querySelector(".toast-text")?.textContent).toBe(
        t("capsule.replaceFailedWhy", { reason: raison }),
      );
    });
  });
});
