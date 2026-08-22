import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import type { ExecuteRepromptInput, ExecuteRepromptResult } from "@/application/reprompt.js";
import type { RepromptResult } from "@/core/types.js";
import { buildPrompt } from "@/core/prompt-builder.js";
import {
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { RepromptService } from "@/apps/desktop/main/reprompt-service.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type { ProfileCatalogResponse } from "@/apps/desktop/shared/ipc-contract.js";
import { resetProfileCatalog } from "@/profiles/catalog.js";
import { getProfile } from "@/profiles/registry.js";
import { findFormProblem, suggestId } from "@/apps/desktop/renderer/settings/ProfilesTab.js";

/**
 * Settings → Profils, driven the way the renderer drives it.
 *
 * The renderer itself is a DOM tree and the suite has no DOM environment, so
 * this exercises the exact sequence of bridge calls the tab makes, against the
 * real handlers and a real profiles directory. What it is really guarding is
 * the last link: a profile created here has to reach the prompt the desktop
 * sends, instructions and level included.
 */

class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();

  handle(channel: string, listener: (event: IpcEventLike, payload: unknown) => unknown): void {
    this.handlers.set(channel, listener);
  }

  invoke(channel: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) return Promise.reject(new Error(`Aucun handler pour ${channel}`));
    try {
      return Promise.resolve(
        handler({ sender: { send: () => undefined, isDestroyed: () => false } }, payload),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

const RESULT: RepromptResult = {
  original: "brut",
  rewritten: "reformulé",
  profile: "sav",
  level: "complete",
  provider: "mock",
  model: "mock-model",
  changes: [],
  quality: { status: "good", signals: [] },
};

let profilesDir: string;
let ipcMain: FakeIpcMain;
let executed: ExecuteRepromptInput[];
let config: Config;

function harness(): void {
  ipcMain = new FakeIpcMain();
  executed = [];

  const execute = (input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> => {
    executed.push(input);
    return Promise.resolve({ result: RESULT, detectedProfile: false });
  };

  registerIpcHandlers({
    ipcMain,
    clipboard: { writeText: vi.fn() },
    loadConfig: () => Promise.resolve(config),
    saveConfig: (next) => {
      config = next;
      return Promise.resolve();
    },
    hydrateCredentials: () => Promise.resolve(),
    env: {},
    profilesDir,
    service: new RepromptService({
      executeReprompt: execute,
      loadConfig: () => Promise.resolve(config),
      env: {},
      createRunId: () => "run-1",
    }),
  });
}

/** The sequence the tab performs when the user fills the form and saves. */
async function createFromRenderer(profile: {
  id: string;
  name: string;
  description: string;
  defaultLevel: "minimal" | "standard" | "complete";
  instructions: string;
}): Promise<ProfileCatalogResponse> {
  const { catalog } = (await ipcMain.invoke(IPC_CHANNELS.profileSave, {
    mode: "create",
    profile,
  })) as { catalog: ProfileCatalogResponse };
  return catalog;
}

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-desktop-flow-"));
  config = { ...DEFAULT_CONFIG, defaultProvider: "mock" };
  harness();
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("Réglages → Profils, bout en bout", () => {
  it("crée un profil, rafraîchit le catalogue et le rend sélectionnable", async () => {
    const catalog = await createFromRenderer({
      id: "sav",
      name: "SAV",
      description: "Support après-vente.",
      defaultLevel: "complete",
      instructions: "Cite toujours le numéro de ticket.",
    });

    // The mutation answers with the refreshed catalogue: the tab never has to
    // ask again, and the list cannot show a state that is already stale.
    const created = catalog.entries.find((entry) => entry.id === "sav");
    expect(created).toMatchObject({ origin: "local", defaultLevel: "complete" });
  });

  it("transmet les instructions du profil au moteur de prompt", async () => {
    await createFromRenderer({
      id: "sav",
      name: "SAV",
      description: "Support après-vente.",
      defaultLevel: "standard",
      instructions: "Cite toujours le numéro de ticket.",
    });

    await ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "brut", profileId: "sav" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(executed).toHaveLength(1);
    expect(executed[0]?.profileId).toBe("sav");

    // The last link, and the one that used to be broken: what the engine will
    // put in the system prompt.
    const resolved = getProfile("sav");
    const run = executed[0];
    expect(resolved).toBeDefined();
    expect(run).toBeDefined();
    if (resolved === undefined || run === undefined) return;

    const prompt = buildPrompt({
      input: "brut",
      profile: resolved,
      level: run.level,
      includeChanges: true,
    }).systemPrompt;
    expect(prompt).toContain("Cite toujours le numéro de ticket.");
  });

  it("applique le niveau déclaré par le profil choisi comme défaut", async () => {
    await createFromRenderer({
      id: "brief",
      name: "Brief",
      description: "Pour les demandes sous-spécifiées.",
      defaultLevel: "complete",
      instructions: "Structure la demande.",
    });
    // Selecting it as the default is what the tab does through config:write.
    config = { ...config, defaultProfile: "brief", defaultLevel: "minimal" };

    await ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "brut" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The profile's level, not the configured one: `config.defaultLevel` was
    // read straight before, which made a profile's declared level inert here.
    expect(executed[0]?.level).toBe("complete");
    expect(executed[0]?.profileId).toBe("brief");
  });

  it("laisse un niveau demandé explicitement passer devant le profil", async () => {
    await createFromRenderer({
      id: "brief",
      name: "Brief",
      description: "d",
      defaultLevel: "complete",
      instructions: "i",
    });
    config = { ...config, defaultProfile: "brief" };

    await ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "brut", level: "minimal" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(executed[0]?.level).toBe("minimal");
  });

  it("supprime un profil et le retire du catalogue rendu", async () => {
    await createFromRenderer({
      id: "jetable",
      name: "Jetable",
      description: "d",
      defaultLevel: "standard",
      instructions: "i",
    });

    const { catalog } = (await ipcMain.invoke(IPC_CHANNELS.profileDelete, {
      id: "jetable",
    })) as { catalog: ProfileCatalogResponse };

    expect(catalog.entries.some((entry) => entry.id === "jetable")).toBe(false);
  });

  it("rend un profil local résoluble sans redémarrer", async () => {
    // The catalogue is module-level state: a create has to publish it, or the
    // engine would refuse the profile the user just made.
    await createFromRenderer({
      id: "frais",
      name: "Frais",
      description: "d",
      defaultLevel: "standard",
      instructions: "i",
    });

    expect(getProfile("frais")).toBeDefined();
  });
});

describe("aides du formulaire renderer", () => {
  it("dérive un identifiant lisible depuis le nom", () => {
    expect(suggestId("Support client")).toBe("support-client");
    expect(suggestId("Rédaction web")).toBe("redaction-web");
    expect(suggestId("  Revue — code  ")).toBe("revue-code");
  });

  it("signale le premier problème, dans l'ordre des champs", () => {
    const base = {
      mode: "create" as const,
      id: "",
      name: "",
      description: "",
      extends: "",
      defaultLevel: "standard" as const,
      instructions: "",
    };
    expect(findFormProblem(base, [])).toContain("nom");
    expect(findFormProblem({ ...base, name: "SAV" }, [])).toContain("identifiant");
    expect(findFormProblem({ ...base, name: "SAV", id: "S A V" }, [])).toContain("invalide");
  });

  it("refuse un identifiant déjà pris, sauf pour le profil qu'on édite", () => {
    const form = {
      mode: "create" as const,
      id: "sav",
      name: "SAV",
      description: "d",
      extends: "",
      defaultLevel: "standard" as const,
      instructions: "i",
    };
    expect(findFormProblem(form, ["sav"])).toContain("déjà pris");
    // An edit keeps its own id: that is not a collision with itself.
    expect(findFormProblem({ ...form, mode: "update" }, ["sav"])).toBeUndefined();
  });

  it("ne réclame pas les champs copiés par le main en mode duplication", () => {
    expect(
      findFormProblem(
        {
          mode: "duplicate",
          sourceId: "clean",
          id: "mon-clean",
          name: "Mon clean",
          description: "",
          extends: "",
          defaultLevel: "standard",
          instructions: "",
        },
        [],
      ),
    ).toBeUndefined();
  });

  it("accepte un formulaire complet", () => {
    expect(
      findFormProblem(
        {
          mode: "create",
          id: "sav",
          name: "SAV",
          description: "d",
          extends: "clean",
          defaultLevel: "standard",
          instructions: "i",
        },
        [],
      ),
    ).toBeUndefined();
  });
});
