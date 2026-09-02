import { describe, expect, it, vi } from "vitest";
import { registerIpcHandlers } from "@/apps/desktop/main/ipc.js";
import { RepromptService } from "@/apps/desktop/main/reprompt-service.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import { RESULT_ACCEPT_TEXT_MAX_LENGTH } from "@/apps/desktop/shared/ipc-contract.js";
import {
  MOCK_CONFIG,
  sentChannels,
  setup,
  streamingExecute,
  type Harness,
} from "./desktop-ipc-harness.js";

/**
 * `result:accept` : ce qui sort de l'application.
 *
 * C'est le seul canal par lequel un texte du renderer atteint le presse-
 * papiers ou l'application source. Il n'est pas générique pour autant : il
 * exige un run existant, et le contrat borne et valide le texte qu'il porte.
 */

describe("result:accept", () => {
  async function finishRun(harness: Harness): Promise<void> {
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });
  }

  it("mode copy : écrit le résultat dans le presse-papiers", async () => {
    const harness = setup({});
    await finishRun(harness);
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "copy" },
      harness.sender,
    )) as { applied: boolean };
    expect(response).toEqual({ applied: true });
    expect(harness.clipboard.writeText).toHaveBeenCalledWith("demande reformulée");
  });

  it("mode replace : dégradé explicite tant que le lot 2 n'est pas livré", async () => {
    const harness = setup({});
    await finishRun(harness);
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    )) as { applied: boolean };
    expect(response).toEqual({ applied: false });
    expect(harness.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("runId inconnu : applied false, sans erreur", async () => {
    const harness = setup({});
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "inconnu", mode: "copy" },
      harness.sender,
    )) as { applied: boolean };
    expect(response).toEqual({ applied: false });
  });

  /**
   * Le résultat repris à la main.
   *
   * La capsule le rend éditable, et ce qui est copié ou remplacé doit être ce
   * qui est affiché. Le texte voyage donc AVEC l'acceptation : pas de canal
   * pour l'enregistrer d'abord, donc pas d'instant entre l'enregistrement et
   * l'application où le texte appliqué pourrait ne plus être celui montré.
   */
  describe("texte repris à la main", () => {
    const EDITE = "demande reformulée, puis corrigée\n\nsur deux paragraphes";

    it("mode copy : copie le texte édité, au caractère près", async () => {
      const harness = setup({});
      await finishRun(harness);

      const response = await harness.ipcMain.invoke(
        IPC_CHANNELS.resultAccept,
        { runId: "run-1", mode: "copy", text: EDITE },
        harness.sender,
      );

      expect(response).toEqual({ applied: true });
      expect(harness.clipboard.writeText).toHaveBeenCalledWith(EDITE);
      expect(harness.clipboard.writeText).not.toHaveBeenCalledWith("demande reformulée");
    });

    it("mode replace : réinjecte le texte édité, pas celui du modèle", async () => {
      const replace = vi.fn(() => Promise.resolve({ applied: true }));
      const harness = setup({});
      registerIpcHandlers({
        ipcMain: harness.ipcMain,
        clipboard: harness.clipboard,
        service: new RepromptService({
          executeReprompt: streamingExecute(),
          loadConfig: () => Promise.resolve(MOCK_CONFIG),
          env: {},
          createRunId: () => "run-1",
        }),
        captureService: { consumeStashed: () => ({ empty: true }), replace } as never,
      });
      await finishRun(harness);

      await harness.ipcMain.invoke(
        IPC_CHANNELS.resultAccept,
        { runId: "run-1", mode: "replace", text: EDITE },
        harness.sender,
      );

      expect(replace).toHaveBeenCalledWith(EDITE);
    });

    it("sans texte, applique le résultat que le processus principal a produit", async () => {
      // L'absence de `text` n'est pas un détail : elle dit « rien n'a été
      // modifié », et c'est ce qui garde le chemin sans édition identique.
      const harness = setup({});
      await finishRun(harness);

      await harness.ipcMain.invoke(
        IPC_CHANNELS.resultAccept,
        { runId: "run-1", mode: "copy" },
        harness.sender,
      );

      expect(harness.clipboard.writeText).toHaveBeenCalledWith("demande reformulée");
    });

    it("runId inconnu : refusé, même avec un texte valide", async () => {
      // Le canal n'est pas un presse-papiers générique : sans run existant, un
      // texte du renderer n'atteint jamais le presse-papiers.
      const harness = setup({});

      const response = await harness.ipcMain.invoke(
        IPC_CHANNELS.resultAccept,
        { runId: "inconnu", mode: "copy", text: EDITE },
        harness.sender,
      );

      expect(response).toEqual({ applied: false });
      expect(harness.clipboard.writeText).not.toHaveBeenCalled();
    });

    it.each([
      ["vide", ""],
      ["fait d'espaces", "   \n  "],
    ])("refuse un texte %s", async (_cas, text) => {
      // Accepter, c'est écrire : remplacer une sélection par du vide est une
      // perte, jamais une reformulation.
      const harness = setup({});
      await finishRun(harness);

      await expect(
        harness.ipcMain.invoke(
          IPC_CHANNELS.resultAccept,
          { runId: "run-1", mode: "copy", text },
          harness.sender,
        ),
      ).rejects.toThrow();
      expect(harness.clipboard.writeText).not.toHaveBeenCalled();
    });

    it("refuse un texte au-delà de la borne du contrat", async () => {
      const harness = setup({});
      await finishRun(harness);

      await expect(
        harness.ipcMain.invoke(
          IPC_CHANNELS.resultAccept,
          { runId: "run-1", mode: "copy", text: "x".repeat(RESULT_ACCEPT_TEXT_MAX_LENGTH + 1) },
          harness.sender,
        ),
      ).rejects.toThrow();
      expect(harness.clipboard.writeText).not.toHaveBeenCalled();
    });

    it("accepte exactement la borne", async () => {
      const harness = setup({});
      await finishRun(harness);
      const limite = "x".repeat(RESULT_ACCEPT_TEXT_MAX_LENGTH);

      const response = await harness.ipcMain.invoke(
        IPC_CHANNELS.resultAccept,
        { runId: "run-1", mode: "copy", text: limite },
        harness.sender,
      );

      expect(response).toEqual({ applied: true });
      expect(harness.clipboard.writeText).toHaveBeenCalledWith(limite);
    });

    it("refuse une charge utile hors contrat", async () => {
      // Le schéma est `strict` : rien d'autre que runId, mode et text ne
      // traverse, et un champ de plus fait échouer l'acceptation entière.
      const harness = setup({});
      await finishRun(harness);

      await expect(
        harness.ipcMain.invoke(
          IPC_CHANNELS.resultAccept,
          { runId: "run-1", mode: "copy", text: EDITE, target: "/etc/passwd" },
          harness.sender,
        ),
      ).rejects.toThrow();
    });
  });
});

/**
 * Le remplacement, et ce qu'il dit quand il n'a pas lieu.
 *
 * `applied: false` seul ne disait rien : la capsule ne pouvait pas
 * distinguer une permission refusée d'une application source restée en
 * arrière-plan, et affichait le même « remplacement impossible » pour les
 * deux.
 */
describe("result:accept en mode replace", () => {
  it("result:accept replace délègue au service de capture", async () => {
    const replace = vi.fn(() => Promise.resolve({ applied: true }));
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      service: new RepromptService({
        executeReprompt: streamingExecute(),
        loadConfig: () => Promise.resolve(MOCK_CONFIG),
        env: {},
        createRunId: () => "run-1",
      }),
      captureService: {
        consumeStashed: () => ({ empty: true }),
        replace,
      } as never,
    });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    );
    expect(response).toEqual({ applied: true });
    expect(replace).toHaveBeenCalledWith("demande reformulée");
  });

  it("rend le focus clavier avant de coller", async () => {
    // La capsule est un `type: "panel"` : sur macOS un panneau non activant
    // garde le focus clavier sans rendre l'application frontmost. System Events
    // répondait donc que l'application source était déjà au premier plan,
    // `activateApp` confirmait une bascule qui n'avait pas lieu, et ⌘V
    // atterrissait dans la capsule — sélection intacte, succès annoncé.
    const order: string[] = [];
    const replace = vi.fn(() => {
      order.push("replace");
      return Promise.resolve({ applied: true });
    });
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      service: new RepromptService({
        executeReprompt: streamingExecute(),
        loadConfig: () => Promise.resolve(MOCK_CONFIG),
        env: {},
        createRunId: () => "run-1",
      }),
      captureService: { consumeStashed: () => ({ empty: true }), replace } as never,
      hideCapsule: () => {
        order.push("hide");
      },
      showCapsule: () => {
        order.push("reveal");
      },
    });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    );

    // Cachée avant la frappe, et laissée cachée : la capsule se ferme ensuite.
    expect(order).toEqual(["hide", "replace"]);
  });

  it("ramène la capsule quand le remplacement a échoué", async () => {
    // Le message d'échec s'affiche dans la capsule : la cacher sans la ramener
    // le rendrait invisible.
    const order: string[] = [];
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      service: new RepromptService({
        executeReprompt: streamingExecute(),
        loadConfig: () => Promise.resolve(MOCK_CONFIG),
        env: {},
        createRunId: () => "run-1",
      }),
      captureService: {
        consumeStashed: () => ({ empty: true }),
        replace: () => Promise.resolve({ applied: false, reason: "source app unknown" }),
      } as never,
      hideCapsule: () => {
        order.push("hide");
      },
      showCapsule: () => {
        order.push("reveal");
      },
    });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    );

    expect(order).toEqual(["hide", "reveal"]);
  });

  it("porte jusqu'au renderer la raison d'un remplacement refusé", async () => {
    // `ReplaceOutcome.reason` distingue « application source inconnue » d'une
    // permission refusée. Elle s'arrêtait au contrat, qui ne déclarait que
    // `applied` : la capsule ne pouvait dire que « remplacement impossible ».
    const replace = vi.fn(() =>
      Promise.resolve({ applied: false, reason: "source app did not come back to the front" }),
    );
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      service: new RepromptService({
        executeReprompt: streamingExecute(),
        loadConfig: () => Promise.resolve(MOCK_CONFIG),
        env: {},
        createRunId: () => "run-1",
      }),
      captureService: {
        consumeStashed: () => ({ empty: true }),
        replace,
      } as never,
    });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    );
    expect(response).toEqual({
      applied: false,
      reason: "source app did not come back to the front",
    });
  });
});
