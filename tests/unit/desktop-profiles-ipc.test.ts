import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import {
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  ProfileCatalogResponse,
  ProfileDetail,
  ProfileExportResponse,
  ProfileMutationResponse,
} from "@/apps/desktop/shared/ipc-contract.js";
import { resetProfileCatalog } from "@/profiles/catalog.js";
import { createLocalProfile, readLocalProfile } from "@/profiles/local-store.js";
import { parseCustomProfile, type CustomProfile } from "@/profiles/custom.js";

/**
 * Profile management over IPC.
 *
 * The handlers run against a real temporary profiles directory: the schema,
 * the atomic write and the shared catalogue all execute. Stubbing them would
 * prove the channels are wired to *something*, not that a profile created from
 * the desktop is on disk and usable afterwards.
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

const LOCAL: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie, cite le numéro de ticket.",
};

let profilesDir: string;
let exportDir: string;
let ipcMain: FakeIpcMain;
let savedConfig: Config;

function harness(
  options: { config?: Config; saveDialog?: () => Promise<string | undefined> } = {},
) {
  savedConfig = options.config ?? { ...DEFAULT_CONFIG, defaultProvider: "mock" };
  ipcMain = new FakeIpcMain();
  registerIpcHandlers({
    ipcMain,
    clipboard: { writeText: vi.fn() },
    loadConfig: () => Promise.resolve(savedConfig),
    saveConfig: () => Promise.resolve(),
    hydrateCredentials: () => Promise.resolve(),
    env: {},
    profilesDir,
    showSaveDialog: options.saveDialog ?? (() => Promise.resolve(undefined)),
  });
  return ipcMain;
}

async function catalog(): Promise<ProfileCatalogResponse> {
  return (await ipcMain.invoke(IPC_CHANNELS.profilesCatalog, undefined)) as ProfileCatalogResponse;
}

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-desktop-profiles-"));
  exportDir = await mkdtemp(path.join(os.tmpdir(), "rp-desktop-export-"));
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true }).catch(() => undefined);
  await rm(exportDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("profiles:catalog", () => {
  it("keeps the virtual auto profile visible in settings", async () => {
    harness();

    const response = await catalog();
    expect(response.entries[0]).toMatchObject({
      id: "auto",
      origin: "auto",
    });
  });

  it("lists built-in and local profiles with their origin", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    const response = await catalog();
    const local = response.entries.filter((entry) => entry.origin === "local");
    const builtin = response.entries.filter((entry) => entry.origin === "builtin");

    expect(builtin.length).toBeGreaterThan(0);
    expect(local.map((entry) => entry.id)).toEqual(["support-client"]);
  });

  it("never sends instructions in a listing", async () => {
    // The renderer lists far more often than it edits; a list is not a reason
    // to push every prompt across the bridge.
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    const response = await catalog();
    expect(JSON.stringify(response)).not.toContain("cite le numéro de ticket");
    expect(JSON.stringify(response)).not.toContain("instructions");
  });

  it("reports a local file the catalogue could not load", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();
    const response = await catalog();
    // Nothing broken here, but the field exists and is carried through.
    expect(Array.isArray(response.problems)).toBe(true);
  });
});

describe("profiles:read", () => {
  it("returns the whole profile for an explicit edit", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    const detail = (await ipcMain.invoke(IPC_CHANNELS.profileRead, {
      id: "support-client",
    })) as ProfileDetail;

    expect(detail.instructions).toBe(LOCAL.instructions);
    expect(detail.extends).toBe("clean");
  });

  it("refuses a built-in, which has no file", async () => {
    harness();
    await expect(ipcMain.invoke(IPC_CHANNELS.profileRead, { id: "clean" })).rejects.toThrow(
      /built-in/,
    );
  });

  it("rejects a malformed payload before touching the disk", async () => {
    harness();
    await expect(ipcMain.invoke(IPC_CHANNELS.profileRead, { id: "" })).rejects.toThrow();
    await expect(ipcMain.invoke(IPC_CHANNELS.profileRead, { nope: 1 })).rejects.toThrow();
  });
});

describe("profiles:save", () => {
  it("creates a profile and returns the refreshed catalogue", async () => {
    harness();

    const response = (await ipcMain.invoke(IPC_CHANNELS.profileSave, {
      mode: "create",
      profile: {
        id: "sav",
        name: "SAV",
        description: "Support après-vente.",
        defaultLevel: "standard",
        instructions: "Sois factuel.",
      },
    })) as ProfileMutationResponse;

    expect((await readLocalProfile("sav", profilesDir)).name).toBe("SAV");
    // The caller never has to ask again: the mutation answers with the state.
    expect(response.catalog.entries.some((entry) => entry.id === "sav")).toBe(true);
  });

  it("refuses to create an id already taken", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileSave, {
        mode: "create",
        profile: {
          id: "support-client",
          name: "Autre",
          description: "Autre.",
          defaultLevel: "standard",
          instructions: "Autre.",
        },
      }),
    ).rejects.toThrow();

    expect((await readLocalProfile("support-client", profilesDir)).name).toBe("Support client");
  });

  it("refuses to update a profile that does not exist", async () => {
    // The mirror of create: `update` must not quietly invent a profile.
    harness();
    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileSave, {
        mode: "update",
        profile: {
          id: "jamais-cree",
          name: "X",
          description: "X.",
          defaultLevel: "standard",
          instructions: "X.",
        },
      }),
    ).rejects.toThrow();
  });

  it("updates an existing profile in place", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    await ipcMain.invoke(IPC_CHANNELS.profileSave, {
      mode: "update",
      profile: {
        id: "support-client",
        name: "Support niveau 2",
        description: LOCAL.description,
        extends: "clean",
        defaultLevel: "complete",
        instructions: "Escalade avec le contexte complet.",
      },
    });

    const stored = await readLocalProfile("support-client", profilesDir);
    expect(stored.name).toBe("Support niveau 2");
    expect(stored.defaultLevel).toBe("complete");
  });

  it("refuses to write over a built-in", async () => {
    harness();
    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileSave, {
        mode: "update",
        profile: {
          id: "clean",
          name: "Détourné",
          description: "Détourné.",
          defaultLevel: "standard",
          instructions: "Détourné.",
        },
      }),
    ).rejects.toThrow(/built-in/);
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    harness();
    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileSave, {
        mode: "create",
        profile: {
          id: "sav",
          name: "SAV",
          description: "d",
          defaultLevel: "standard",
          instructions: "i",
          surprise: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an invalid local id at the IPC boundary", async () => {
    harness();
    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileSave, {
        mode: "create",
        profile: {
          id: "S A V",
          name: "SAV",
          description: "d",
          defaultLevel: "standard",
          instructions: "i",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("profiles:duplicate", () => {
  it("turns a built-in into a standalone local profile", async () => {
    harness();

    const response = (await ipcMain.invoke(IPC_CHANNELS.profileDuplicate, {
      sourceId: "clean",
      targetId: "mon-clean",
      name: "Mon clean",
    })) as ProfileMutationResponse;

    const stored = await readLocalProfile("mon-clean", profilesDir);
    expect(stored.name).toBe("Mon clean");
    // Flattened, not linked: the copy survives the built-in changing wording.
    expect(stored.extends).toBeUndefined();
    expect(response.catalog.entries.some((entry) => entry.id === "mon-clean")).toBe(true);
  });

  it("copies a local profile and keeps its base", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    await ipcMain.invoke(IPC_CHANNELS.profileDuplicate, {
      sourceId: "support-client",
      targetId: "support-bis",
    });

    expect((await readLocalProfile("support-bis", profilesDir)).extends).toBe("clean");
  });

  it("never overwrites an existing target", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileDuplicate, {
        sourceId: "clean",
        targetId: "support-client",
      }),
    ).rejects.toThrow();

    expect((await readLocalProfile("support-client", profilesDir)).name).toBe("Support client");
  });

  it("refuses the virtual auto profile as a source", async () => {
    harness();
    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileDuplicate, {
        sourceId: "auto",
        targetId: "auto-copy",
      }),
    ).rejects.toThrow();
  });
});

describe("profiles:delete", () => {
  it("deletes a local profile and refreshes the catalogue", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness();

    const response = (await ipcMain.invoke(IPC_CHANNELS.profileDelete, {
      id: "support-client",
    })) as ProfileMutationResponse;

    expect(response.catalog.entries.some((entry) => entry.id === "support-client")).toBe(false);
    await expect(readLocalProfile("support-client", profilesDir)).rejects.toThrow();
  });

  it("refuses a built-in", async () => {
    harness();
    await expect(ipcMain.invoke(IPC_CHANNELS.profileDelete, { id: "clean" })).rejects.toThrow(
      /built-in/,
    );
  });

  it("refuses to leave the default profile pointing at nothing", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    harness({ config: { ...DEFAULT_CONFIG, defaultProfile: "support-client" } });

    await expect(
      ipcMain.invoke(IPC_CHANNELS.profileDelete, { id: "support-client" }),
    ).rejects.toThrow(/default profile/);

    expect(await readLocalProfile("support-client", profilesDir)).toBeDefined();
  });
});

describe("profiles:export", () => {
  it("writes the document the user chose, with the profile suffix offered", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const target = path.join(exportDir, "chosen.reqraft-profile.json");
    const offered: string[] = [];

    harness({
      saveDialog: (defaultName?: string) => {
        if (defaultName !== undefined) offered.push(defaultName);
        return Promise.resolve(target);
      },
    });

    const response = (await ipcMain.invoke(IPC_CHANNELS.profileExport, {
      id: "support-client",
    })) as ProfileExportResponse;

    expect(response.path).toBe(target);
    expect(offered[0]).toBe("support-client.reqraft-profile.json");
    expect(parseCustomProfile(await readFile(target, "utf8"))).toEqual(LOCAL);
  });

  it("writes nothing when the dialog is dismissed", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const writeExport = vi.fn(() => Promise.resolve());

    ipcMain = new FakeIpcMain();
    registerIpcHandlers({
      ipcMain,
      clipboard: { writeText: vi.fn() },
      loadConfig: () => Promise.resolve({ ...DEFAULT_CONFIG }),
      profilesDir,
      showSaveDialog: () => Promise.resolve(undefined),
      writeExport,
    });

    const response = (await ipcMain.invoke(IPC_CHANNELS.profileExport, {
      id: "support-client",
    })) as ProfileExportResponse;

    // Dismissing is not an error, and nothing is written.
    expect(response.path).toBeUndefined();
    expect(writeExport).not.toHaveBeenCalled();
  });

  it("renames a built-in so the document stays importable", async () => {
    const offered: string[] = [];
    harness({
      saveDialog: (defaultName?: string) => {
        if (defaultName !== undefined) offered.push(defaultName);
        return Promise.resolve(undefined);
      },
    });

    await ipcMain.invoke(IPC_CHANNELS.profileExport, { id: "clean" });

    // The schema refuses built-in ids, so `clean.json` would export cleanly
    // and fail on import.
    expect(offered[0]).toBe("clean-copy.reqraft-profile.json");
  });

  it("refuses the virtual auto profile", async () => {
    harness();
    await expect(ipcMain.invoke(IPC_CHANNELS.profileExport, { id: "auto" })).rejects.toThrow();
  });
});
