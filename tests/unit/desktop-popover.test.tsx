/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  annonce,
  arriveAuResultat,
  champPrompt,
  champResultat,
  commande,
  EN,
  monterPopover,
  pousserResultat,
  repromptResult,
  type PopoverHarness,
} from "./desktop-popover-harness.js";

/**
 * Le popover, exercé pour de vrai.
 *
 * Il est monté dans un DOM, on tape dans ses deux champs, on appuie sur ses
 * touches, et ce que l'on vérifie est ce que le pont IPC reçoit — donc ce que
 * le processus principal copierait. Rien ici ne relit la source : une ligne
 * présente ne prouve pas un comportement.
 *
 * La géométrie réelle — le pied qui tient dans 320 × 260, le contenu qui
 * défile seul, l'annonce au-dessus du pied — est mesurée dans la vraie fenêtre
 * Electron par le scénario `popover-ui` (`tests/e2e/desktop.test.ts`).
 */

const PROMPT = "fais moi un point demain sur le projet";
const MODEL_TEXT = "Fais un point sur l'avancement du projet demain matin.";
const EDITED_TEXT = "Fais un point sur l'avancement du projet demain à 9 h.";
const EDITED_PROMPT = "fais moi un point vendredi sur le budget";

afterEach(() => {
  cleanup();
});

/** Arrive au résultat, puis remplace le texte du champ par celui donné. */
async function editerLeResultat(harness: PopoverHarness, texte: string): Promise<void> {
  await arriveAuResultat(harness, PROMPT, MODEL_TEXT);
  await harness.user.clear(champResultat());
  await harness.user.type(champResultat(), texte);
  expect(champResultat().value).toBe(texte);
}

/** Rend le focus au document : les commandes du popover en dépendent. */
async function sortirDuChamp(harness: PopoverHarness): Promise<void> {
  await harness.user.keyboard("{Escape}");
  expect(document.activeElement).not.toBe(champResultat());
}

describe("le résultat du popover", () => {
  it("arrive dans un champ modifiable, sans cadre ni halo", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    const champ = champResultat();
    expect(champ.readOnly).toBe(false);
    // La même pièce que la capsule, et la typographie de la surface qui
    // l'accueille : c'est le conteneur qui la porte, pas le champ.
    expect(champ.className).toBe("result-editor-input");
    expect(champ.parentElement?.className).toBe("result-editor popover-result");
  });

  it("copie exactement le texte repris", async () => {
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande(EN["popover.copy"]));

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", EDITED_TEXT);
    });
    await waitFor(() => {
      expect(annonce()?.textContent).toBe(EN["popover.copied"]);
    });
  });

  it("ne porte aucun texte quand rien n'a été repris", async () => {
    // `undefined` dit « le texte du modèle » : le processus principal copie
    // alors exactement ce qu'il a produit, sans aller-retour de sérialisation.
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    await harness.user.click(commande(EN["popover.copy"]));

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", undefined);
    });
  });

  it("refuse de copier un résultat vidé, et le dit", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);
    await harness.user.clear(champResultat());

    await harness.user.click(commande(EN["popover.copy"]));

    await waitFor(() => {
      expect(annonce()?.textContent).toBe(EN["popover.resultEmpty"]);
    });
    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("annonce l'échec de la copie plutôt que de faire comme si", async () => {
    const harness = await monterPopover({ accept: { applied: false } });
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    await harness.user.click(commande(EN["popover.copy"]));

    await waitFor(() => {
      expect(annonce()?.textContent).toBe(EN["clipboard.copyFailed"]);
    });
  });
});

describe("le prompt de départ du popover", () => {
  it("est celui que la relance envoie", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    await harness.user.clear(champPrompt());
    await harness.user.type(champPrompt(), EDITED_PROMPT);
    await harness.user.click(commande(EN["capsule.reformulate"]));

    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
        input: EDITED_PROMPT,
        profileId: "auto",
        level: "standard",
      });
    });
  });

  it("refuse de partir vide, et le dit", async () => {
    const harness = await monterPopover();

    await harness.user.click(commande(EN["capsule.reformulate"]));

    await waitFor(() => {
      expect(annonce()?.textContent).toBe(EN["capsule.promptEmpty"]);
    });
    expect(harness.bridge.startReprompt).not.toHaveBeenCalled();
  });
});

describe("les raccourcis du popover", () => {
  it("relance sur ⌘⏎ depuis le champ du résultat, une seule fois", async () => {
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(2);
    });
    expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
      input: PROMPT,
      profileId: "auto",
      level: "standard",
    });
    // La frappe n'a pas été rendue au champ : une nouvelle ligne dans le
    // résultat au moment où on le relance serait une correction perdue.
    expect(champPrompt().value).toBe(PROMPT);
  });

  it("relance sur ⌘⏎ depuis le champ du prompt, une seule fois", async () => {
    // Le champ portait ce raccourci en propre ; la fenêtre le porte désormais
    // aussi. Deux écouteurs pour une frappe lanceraient deux générations.
    const harness = await monterPopover();
    await harness.user.type(champPrompt(), PROMPT);

    await harness.user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
    });
  });

  it("laisse ⌘C au champ tant que le curseur y est", async () => {
    // Sinon on ne peut plus copier trois mots d'un résultat : la commande du
    // popover prendrait toute la place, y compris pendant l'écriture.
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);

    const frappes: KeyboardEvent[] = [];
    window.addEventListener("keydown", (event) => {
      frappes.push(event);
    });
    await harness.user.keyboard("{Meta>}c{/Meta}");

    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
    expect(frappes.at(-1)?.defaultPrevented).toBe(false);
  });

  it("copie sur ⌘C une fois sorti du champ", async () => {
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);
    await sortirDuChamp(harness);

    await harness.user.keyboard("{Meta>}c{/Meta}");

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", EDITED_TEXT);
    });
  });

  it("laisse ⌘C à une sélection de texte en cours", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);
    await sortirDuChamp(harness);

    const selection = window.getSelection();
    selection?.selectAllChildren(screen.getByText(EN["popover.lastResult"]));
    expect(selection?.isCollapsed).toBe(false);

    await harness.user.keyboard("{Meta>}c{/Meta}");

    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("ne copie rien tant qu'aucun résultat n'existe", async () => {
    const harness = await monterPopover();

    await harness.user.keyboard("{Meta>}c{/Meta}");

    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("rend la main sur esc sans rien jeter", async () => {
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.keyboard("{Escape}");

    expect(champResultat().value).toBe(EDITED_TEXT);
    expect(document.activeElement).not.toBe(champResultat());
  });
});

describe("la génération suivante", () => {
  it("efface la reprise précédente plutôt que de la copier", async () => {
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande(EN["capsule.reformulate"]));
    await pousserResultat(harness, "Autre reformulation.");

    expect(champResultat().value).toBe("Autre reformulation.");
    await harness.user.click(commande(EN["popover.copy"]));
    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-2", "copy", undefined);
    });
  });

  it("ne laisse pas le résultat précédent sous un écran d'erreur", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    await harness.user.click(commande(EN["capsule.reformulate"]));
    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(2);
    });
    harness.push.error({
      runId: harness.dernierRunId(),
      error: { title: "Error", message: "provider unavailable" },
    });

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "provider unavailable");
    expect(screen.queryByLabelText(EN["popover.resultLabel"])).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(EN["popover.copy"], "i") })).toBeNull();
  });

  it("ignore un résultat qui appartient à un run abandonné", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    harness.push.done({ runId: "run-oublie", result: repromptResult("texte d'un autre run") });

    expect(champResultat().value).toBe(MODEL_TEXT);
  });
});

describe("le profil et le niveau", () => {
  it("changent la demande suivante sans toucher au résultat affiché", async () => {
    const harness = await monterPopover();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande("standard"));
    // La reprise survit au changement : relancer est un geste explicite.
    expect(champResultat().value).toBe(EDITED_TEXT);

    await harness.user.click(commande(EN["capsule.reformulate"]));
    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
        input: PROMPT,
        profileId: "auto",
        level: "complete",
      });
    });
  });

  it("relance avec le profil choisi dans la feuille", async () => {
    const harness = await monterPopover({
      profiles: [
        { id: "auto", name: "auto", description: "", origin: "auto" },
        { id: "clean", name: "clean", description: "", origin: "builtin" },
      ],
    });
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);

    await harness.user.click(commande("auto"));
    await harness.user.click(await screen.findByRole("button", { name: /clean/ }));
    await harness.user.click(commande(EN["capsule.reformulate"]));

    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
        input: PROMPT,
        profileId: "clean",
        level: "standard",
      });
    });
  });
});

describe("la mise en page du popover", () => {
  it("fait défiler le résultat seul et garde copier dans le pied fixe", async () => {
    const harness = await monterPopover();
    const long = Array.from({ length: 30 }, (_, index) => `Line ${String(index + 1)}`).join("\n");
    await arriveAuResultat(harness, PROMPT, long);

    const copy = commande(EN["popover.copy"]);
    expect(copy.closest(".popover-footer")).not.toBeNull();
    expect(copy.closest(".popover-content")).toBeNull();
    expect(champResultat().closest(".popover-content")).not.toBeNull();
    // Le champ du prompt reste hors de la zone qui défile : le layout du lot
    // précédent ne bouge pas.
    expect(champPrompt().closest(".popover-content")).toBeNull();
  });

  it("pose l'annonce hors du contenu et hors du pied", async () => {
    const harness = await monterPopover();
    await arriveAuResultat(harness, PROMPT, MODEL_TEXT);
    await harness.user.clear(champResultat());
    await harness.user.click(commande(EN["popover.copy"]));

    const toast = await screen.findByRole("alert");
    // Recouverte par le pied, une annonce ne sert à rien ; poussée dans le
    // contenu, elle défilerait avec le résultat.
    expect(toast.closest(".popover-content")).toBeNull();
    expect(toast.closest(".popover-footer")).toBeNull();
    expect(toast.closest(".toast-layer")).not.toBeNull();
  });
});
