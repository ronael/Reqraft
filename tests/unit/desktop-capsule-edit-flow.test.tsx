/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  arriveAuResultat,
  champPrompt,
  champResultat,
  commande,
  DEFAULT_CAPTURE_TEXT,
  EN,
  espionnerFrappes,
  monterCapsule,
  pousserResultat,
  sortirDeLEdition,
  type CapsuleHarness,
} from "./desktop-capsule-harness.js";

/**
 * L'édition de la capsule, exercée pour de vrai.
 *
 * La capsule est montée dans un DOM, on tape dedans, on appuie sur les
 * touches, et ce que l'on vérifie est ce que le pont IPC reçoit — c'est-à-dire
 * exactement ce que le processus principal appliquerait. Rien ici ne relit la
 * source du composant : une ligne présente ne prouve pas un comportement.
 */

const MODEL_TEXT = "Fais un point sur l'avancement du projet demain matin.";
const EDITED_TEXT = "Fais un point sur l'avancement du projet demain à 9 h.";
const EDITED_PROMPT = "fais moi un point vendredi sur le budget";

afterEach(() => {
  cleanup();
});

/** Arrive au résultat, puis remplace le texte du champ par celui donné. */
async function editerLeResultat(harness: CapsuleHarness, texte: string): Promise<void> {
  await arriveAuResultat(harness, MODEL_TEXT);
  await harness.user.clear(champResultat());
  await harness.user.type(champResultat(), texte);
  expect(champResultat().value).toBe(texte);
}

/** Arrive au résultat, puis remplace le prompt de départ par celui donné. */
async function editerLePrompt(harness: CapsuleHarness, texte: string): Promise<void> {
  await arriveAuResultat(harness, MODEL_TEXT);
  await harness.user.clear(champPrompt());
  await harness.user.type(champPrompt(), texte);
  expect(champPrompt().value).toBe(texte);
}

describe("le trajet jusqu'au résultat", () => {
  it("capture, lance le run, puis rend le résultat éditable", async () => {
    const harness = monterCapsule();

    await arriveAuResultat(harness, MODEL_TEXT);

    expect(harness.bridge.startReprompt).toHaveBeenCalledWith({
      input: DEFAULT_CAPTURE_TEXT,
      level: "standard",
    });
    expect(champResultat().value).toBe(MODEL_TEXT);
    expect(champPrompt().value).toBe(DEFAULT_CAPTURE_TEXT);
  });
});

describe("le prompt de départ modifié", () => {
  it("est celui que la relance envoie", async () => {
    const harness = monterCapsule();
    await editerLePrompt(harness, EDITED_PROMPT);

    await harness.user.click(commande(EN["capsule.rerun"]));

    expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
      input: EDITED_PROMPT,
      level: "standard",
    });
  });

  it("est celui qu'un changement de niveau envoie", async () => {
    const harness = monterCapsule();
    await editerLePrompt(harness, EDITED_PROMPT);

    // ⇥ relance : le niveau change ET le texte part avec, sinon la relance
    // repartirait du texte capturé que plus rien à l'écran ne montre.
    await harness.user.click(commande(`^⇥ ${EN["capsule.level"]}$`));

    expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
      input: EDITED_PROMPT,
      level: "complete",
    });
  });

  it("est le « avant » de la comparaison", async () => {
    const harness = monterCapsule();
    await editerLePrompt(harness, EDITED_PROMPT);

    await harness.user.click(commande(EN["capsule.compare"]));

    const avant = await screen.findByText(`− ${EDITED_PROMPT}`);
    expect(avant).toBeDefined();
  });

  it("reste éditable une fois entièrement vidé, et la relance le dit", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.clear(champPrompt());
    await harness.user.click(commande(EN["capsule.rerun"]));

    // Le champ ne disparaît pas avec son contenu : il n'y aurait plus aucun
    // endroit où ressaisir la demande.
    expect(champPrompt().value).toBe("");
    expect(await screen.findByText(EN["capsule.promptEmpty"])).toBeDefined();
    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
  });

  it("repart normalement une fois ressaisi", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.clear(champPrompt());
    await harness.user.click(commande(EN["capsule.rerun"]));
    await harness.user.type(champPrompt(), EDITED_PROMPT);
    await harness.user.click(commande(EN["capsule.rerun"]));

    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(2);
    expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
      input: EDITED_PROMPT,
      level: "standard",
    });
  });
});

describe("le résultat modifié", () => {
  it("est le texte que le remplacement applique", async () => {
    const harness = monterCapsule();
    await editerLeResultat(harness, EDITED_TEXT);

    await sortirDeLEdition(harness);
    await harness.user.keyboard("{Enter}");

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "replace", EDITED_TEXT);
    });
  });

  it("est le texte que la copie applique", async () => {
    const harness = monterCapsule();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande(EN["capsule.copy"]));

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", EDITED_TEXT);
    });
    expect(await screen.findByText(EN["capsule.copied"])).toBeDefined();
  });

  it("est le « après » de la comparaison", async () => {
    const harness = monterCapsule();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande(EN["capsule.compare"]));

    expect(await screen.findByText(`+ ${EDITED_TEXT}`)).toBeDefined();
    expect(screen.queryByText(`+ ${MODEL_TEXT}`)).toBeNull();
  });

  it("laisse le processus principal appliquer le sien quand rien n'a été repris", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(commande(EN["capsule.copy"]));

    // Pas de texte du tout : le principal applique exactement ce qu'il a
    // produit, sans aller-retour par le renderer.
    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", undefined);
    });
  });

  it("refuse de partir vidé, sans même solliciter le principal", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.clear(champResultat());
    await harness.user.click(commande(EN["capsule.copy"]));

    expect(await screen.findByText(EN["capsule.editEmpty"])).toBeDefined();
    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("disparaît quand un autre profil relance la génération", async () => {
    const harness = monterCapsule({
      profiles: [
        { id: "writing", name: "writing", description: "prose", origin: "builtin" },
        { id: "code", name: "code", description: "technique", origin: "builtin" },
      ],
    });
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande("^writing$"));
    await harness.user.click(await screen.findByRole("button", { name: /code/ }));
    await pousserResultat(harness, "Version technique.");

    expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
      input: DEFAULT_CAPTURE_TEXT,
      level: "standard",
      profileId: "code",
    });
    expect(champResultat().value).toBe("Version technique.");
  });

  it("disparaît quand une nouvelle capture ouvre la capsule", async () => {
    const harness = monterCapsule();
    await editerLeResultat(harness, EDITED_TEXT);

    // Le déclenchement suivant réutilise la MÊME fenêtre : sans remise à zéro,
    // la capture d'après s'ouvrirait sur le texte repris de la précédente.
    harness.push.opened({ id: 2, mode: "capture" });
    await pousserResultat(harness, "Deuxième reformulation.");

    expect(champResultat().value).toBe("Deuxième reformulation.");
    await harness.user.click(commande(EN["capsule.copy"]));
    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-2", "copy", undefined);
    });
  });

  it("ne reste pas sourde quand le champ disparaît sans rendre le curseur", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    // Le champ est démonté par la capture suivante, curseur dedans. Un
    // `blur` n'est pas garanti dans ce cas : si l'édition survivait, ⏎, ⌘C,
    // ⌘R et ⇥ resteraient inertes sans que rien à l'écran ne l'explique.
    await harness.user.click(champResultat());
    harness.push.opened({ id: 2, mode: "capture" });
    await pousserResultat(harness, "Deuxième reformulation.");

    await harness.user.keyboard("{Meta>}c{/Meta}");

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-2", "copy", undefined);
    });
  });

  it("disparaît avec la génération suivante", async () => {
    const harness = monterCapsule();
    await editerLeResultat(harness, EDITED_TEXT);

    await harness.user.click(commande(EN["capsule.rerun"]));
    await pousserResultat(harness, "Une toute autre reformulation.");

    // L'édition précédente ne survit pas : la garder ferait copier un texte
    // que plus rien à l'écran ne montre.
    expect(champResultat().value).toBe("Une toute autre reformulation.");
    await harness.user.click(commande(EN["capsule.copy"]));
    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-2", "copy", undefined);
    });
  });
});

describe("l'annonce sur un résultat long", () => {
  /** Assez de lignes pour que le corps défile bien au-delà de la fenêtre. */
  const LONG = Array.from({ length: 120 }, (_, index) => `ligne ${String(index + 1)}`).join("\n");

  it("se pose hors du corps qui défile, au-dessus du pied", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, LONG);

    await harness.user.click(commande(EN["capsule.copy"]));
    const annonce = await screen.findByText(EN["capsule.copied"]);

    const couche = annonce.closest(".toast-layer");
    expect(couche, "l'annonce doit vivre dans sa propre couche").not.toBeNull();
    // Dans le corps, elle défilerait avec le résultat et serait invisible dès
    // la première page ; sous le pied, elle serait recouverte.
    expect(couche?.closest(".capsule-body")).toBeNull();
    expect(couche?.parentElement?.className).toBe("capsule");
    expect(document.querySelector(".capsule-footer")?.compareDocumentPosition(couche as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("reste annoncée aux lecteurs d'écran", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, LONG);

    await harness.user.click(commande(EN["capsule.copy"]));

    const statut = await screen.findByRole("status");
    expect(statut.textContent).toContain(EN["capsule.copied"]);
  });
});

describe("les raccourcis pendant l'édition", () => {
  it("laissent ⏎ écrire une ligne au lieu de remplacer", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    await harness.user.keyboard("{Enter}suite");

    expect(champResultat().value).toContain("\nsuite");
    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  });

  it("laissent ⌘C au champ, sans copier le résultat entier", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    const frappes = espionnerFrappes();
    await harness.user.keyboard("{Meta>}c{/Meta}");

    expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
    // Rien n'est coupé : la copie de la sélection est le comportement voulu.
    expect(frappes.at(-1)?.defaultPrevented).toBe(false);
  });

  it("coupent ⌘R : ni relance Reqraft, ni rechargement de la fenêtre", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    const frappes = espionnerFrappes();
    await harness.user.keyboard("{Meta>}r{/Meta}");

    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
    // `preventDefault` est ce qui empêche le rechargement : sans lui, la
    // fenêtre repart de zéro et l'édition en cours disparaît.
    expect(frappes.at(-1)?.defaultPrevented).toBe(true);
  });

  it("coupent ⌘D : ni comparaison, ni signet du navigateur", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    const frappes = espionnerFrappes();
    await harness.user.keyboard("{Meta>}d{/Meta}");

    expect(screen.queryByText(`+ ${MODEL_TEXT}`)).toBeNull();
    expect(frappes.at(-1)?.defaultPrevented).toBe(true);
  });

  it("laissent ⇥ au champ sans changer de niveau", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    await harness.user.keyboard("{Tab}");

    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
  });

  it("gardent esc et ⌘. actifs, comme partout ailleurs", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    await harness.user.keyboard("{Meta>}.{/Meta}");
    expect(harness.bridge.cancelReprompt).toHaveBeenCalledWith("run-1");

    await harness.user.keyboard("{Escape}");
    expect(harness.closed).toHaveBeenCalled();
  });

  it("redeviennent des commandes dès que le champ perd le curseur", async () => {
    const harness = monterCapsule();
    await editerLeResultat(harness, EDITED_TEXT);

    await sortirDeLEdition(harness);
    await harness.user.keyboard("{Meta>}c{/Meta}");

    await waitFor(() => {
      expect(harness.bridge.acceptResult).toHaveBeenCalledWith("run-1", "copy", EDITED_TEXT);
    });
  });

  it("laissent la comparaison maintenue par ⌥ montrer les deux textes repris", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);
    await harness.user.clear(champPrompt());
    await harness.user.type(champPrompt(), EDITED_PROMPT);
    await harness.user.clear(champResultat());
    await harness.user.type(champResultat(), EDITED_TEXT);
    await sortirDeLEdition(harness);

    await harness.user.keyboard("{Alt>}");
    expect(await screen.findByText(`− ${EDITED_PROMPT}`)).toBeDefined();
    expect(await screen.findByText(`+ ${EDITED_TEXT}`)).toBeDefined();

    await harness.user.keyboard("{/Alt}");
    await waitFor(() => {
      expect(champResultat().value).toBe(EDITED_TEXT);
    });
  });
});

describe("la fenêtre ne suit ni le flux ni la frappe", () => {
  it("ne redemande aucune hauteur pendant que le texte arrive", async () => {
    const harness = monterCapsule();
    await waitFor(() => {
      expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
    });

    // Le premier fragment fait changer d'état, donc une décision. Les
    // suivants n'en sont pas : une hauteur redemandée à chaque fragment ferait
    // sauter la fenêtre ligne par ligne pendant toute la génération.
    harness.push.delta({ runId: harness.dernierRunId(), chunk: "Fais " });
    await screen.findByText(/Fais/);
    const apresPremierFragment = harness.bridge.resizeCapsule.mock.calls.length;

    for (const chunk of ["un point ", "sur le projet ", "demain ", "matin."]) {
      harness.push.delta({ runId: harness.dernierRunId(), chunk });
    }
    await screen.findByText(/demain matin\./);

    expect(harness.bridge.resizeCapsule.mock.calls).toHaveLength(apresPremierFragment);
  });

  it("ne redemande aucune hauteur pendant la frappe, et une seule au relâchement", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champResultat());
    const avantFrappe = harness.bridge.resizeCapsule.mock.calls.length;
    await harness.user.type(champResultat(), "\nune ligne de plus\net encore une");

    // La géométrie est gelée tant que le curseur est dans le champ : le corps
    // défile, la fenêtre ne bouge pas. C'est la règle qui remplace le
    // `ResizeObserver` du POC.
    expect(harness.bridge.resizeCapsule.mock.calls).toHaveLength(avantFrappe);

    await sortirDeLEdition(harness);

    // Puis un seul réajustement, quand le champ rend la main.
    await waitFor(() => {
      expect(harness.bridge.resizeCapsule.mock.calls).toHaveLength(avantFrappe + 1);
    });
  });

  it("ne redemande aucune hauteur pendant qu'on écrit le prompt de départ", async () => {
    const harness = monterCapsule();
    await arriveAuResultat(harness, MODEL_TEXT);

    await harness.user.click(champPrompt());
    const avant = harness.bridge.resizeCapsule.mock.calls.length;
    await harness.user.type(champPrompt(), " et aussi le budget");

    expect(harness.bridge.resizeCapsule.mock.calls).toHaveLength(avant);
  });
});
