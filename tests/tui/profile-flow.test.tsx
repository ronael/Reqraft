/* @jsxImportSource @opentui/react */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act, useCallback } from "react";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { KeyCodes } from "@opentui/core/testing";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { OpenTuiApp, type TuiServices } from "@/apps/cli/tui/app/OpenTuiApp.js";
import { createProfileServices } from "@/apps/cli/tui/app/profile-services.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { loadProfileCatalog, resetProfileCatalog } from "@/profiles/catalog.js";
import { createLocalProfile, readLocalProfile } from "@/profiles/local-store.js";
import type { CustomProfile } from "@/profiles/custom.js";
import type { RepromptResult } from "@/core/types.js";
import type { ExecuteRepromptInput } from "@/application/reprompt.js";
import { createTranslator } from "@/i18n/translate.js";

registerRendererTeardown();

/**
 * End-to-end profile management, driven through real key events.
 *
 * The services are the production ones, pointed at a temporary directory: the
 * schema, the atomic write and the shared catalogue all run for real. A test
 * that stubbed them would prove the overlays call *something*, not that a
 * profile created here is on disk and selectable afterwards.
 */

const t = createTranslator("fr");

const EXISTING: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie.",
};

let profilesDir: string;
let exportDir: string;
let executed: ExecuteRepromptInput[];

function makeResult(input: string): RepromptResult {
  return {
    original: input,
    rewritten: `REWRITTEN: ${input}`,
    profile: "auto",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: [],
    quality: { status: "good", signals: [] },
    latencyMs: 1,
  };
}

function services(): TuiServices {
  return {
    bootstrap: () => Promise.resolve({ config: { ...DEFAULT_CONFIG } }),
    profiles: createProfileServices({ profilesDir, exportDir }),
    execute: (input) => {
      executed.push(input);
      return Promise.resolve({ result: makeResult(input.input), detectedProfile: false });
    },
    readClipboard: () => Promise.resolve(""),
    writeClipboard: () => Promise.resolve(),
    describeError: (error) => ({ title: "Erreur", message: String(error) }),
  };
}

async function mountApp() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mounted!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    mounted = await testRender(<Host />, { width: 110, height: 40, exitOnCtrlC: false });
  });
  const setup = trackRenderer(mounted);

  const settle = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await setup.flush();
    });
  };
  await settle();

  return {
    frame: () => setup.captureCharFrame(),
    settle,
    chord: async (name: string): Promise<void> => {
      await act(async () => {
        setup.mockInput.pressKey(name, { ctrl: true });
        await setup.flush();
      });
      await settle();
    },
    /** A real terminal sequence, for keys that are not a letter. */
    sequence: async (seq: string): Promise<void> => {
      await act(async () => {
        await setup.mockInput.pressKeys([seq], 30);
        await setup.flush();
      });
      // A lone Escape is only decided once its timeout has passed.
      await new Promise((resolve) => setTimeout(resolve, 70));
      await settle();
    },
    type: async (text: string): Promise<void> => {
      await act(async () => {
        await setup.mockInput.typeText(text);
      });
      await settle();
    },
    arrow: async (direction: "up" | "down"): Promise<void> => {
      await act(async () => {
        setup.mockInput.pressArrow(direction);
        await setup.flush();
      });
      await settle();
    },
    enter: async (): Promise<void> => {
      await act(async () => {
        setup.mockInput.pressEnter();
        await setup.flush();
      });
      await settle();
    },
    /**
     * Settles until a condition holds.
     *
     * A save is several real file-system round trips — write, then reload the
     * catalogue — so the wait has to pass real time, not just drain the
     * microtask queue: forty `setTimeout(0)` turns can all elapse before a
     * single write lands, which made this flaky rather than slow.
     */
    waitUntil: async (predicate: () => boolean, label: string): Promise<void> => {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
        await settle();
      }
      throw new Error(`condition jamais atteinte : ${label}`);
    },
  };
}

function Host(): React.ReactNode {
  const onExit = useCallback(() => undefined, []);
  return <OpenTuiApp t={t} services={services()} onExit={onExit} />;
}

/**
 * Asserts a profile is not on disk.
 *
 * Written out rather than through `.rejects`, which bun does not return as a
 * thenable — awaiting it would assert nothing at all.
 */
async function expectNoProfile(id: string): Promise<void> {
  let missing = false;
  try {
    await readLocalProfile(id, profilesDir);
  } catch {
    missing = true;
  }
  expect(missing).toBe(true);
}

/** Opens the picker and walks the highlight down to a named profile. */
async function openPickerOn(
  app: Awaited<ReturnType<typeof mountApp>>,
  label: string,
): Promise<void> {
  await app.chord("p");
  for (let step = 0; step < 20; step++) {
    const row = app
      .frame()
      .split("\n")
      .find((line) => line.includes(label));
    if (row?.includes("›")) return;
    await app.arrow("down");
  }
  throw new Error(`"${label}" jamais atteint dans le sélecteur`);
}

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-flow-profiles-"));
  exportDir = await mkdtemp(path.join(os.tmpdir(), "rp-flow-export-"));
  executed = [];
  await loadProfileCatalog({ profilesDir });
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true }).catch(() => undefined);
  await rm(exportDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("profile picker and actions", () => {
  test("opens the picker and reaches the actions of a built-in", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");

    const frame = app.frame();
    expect(frame).toContain("Dupliquer");
    // Editing and deleting a built-in are shown with their reason, not hidden.
    expect(frame).toContain("profil intégré");
  }, 120_000);

  test("refuses to edit or delete a built-in", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");

    // "Modifier" is the first row: confirming it must do nothing at all.
    await app.enter();
    expect(app.frame()).toContain("Dupliquer");

    // And the fourth row, "Supprimer", is just as inert.
    for (let step = 0; step < 3; step++) await app.arrow("down");
    await app.enter();
    expect(app.frame()).not.toContain("Supprimer « clean »");
  }, 120_000);

  test("escape leaves the actions overlay", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");
    expect(app.frame()).toContain("Dupliquer");

    await app.sequence(KeyCodes.ESCAPE);
    expect(app.frame()).not.toContain("Dupliquer");
  }, 120_000);
});

describe("creating a profile", () => {
  test("the picker offers creation directly, without the actions chord", async () => {
    const app = await mountApp();
    await app.chord("p");

    // The row sits last, after the profiles: the list reads as what you can
    // pick, then what you can do.
    for (let step = 0; step < 20; step++) {
      const row = app
        .frame()
        .split("\n")
        .find((line) => line.includes("Nouveau profil local"));
      if (row?.includes("›")) break;
      await app.arrow("down");
    }
    await app.enter();

    // The form, not a selected profile named after the row.
    const frame = app.frame();
    expect(frame).toContain("Identifiant");
    expect(frame).toContain("Instructions");
  }, 120_000);

  test("creates it, refreshes the catalogue and selects it", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");

    // "Nouveau profil local" is the last row.
    for (let step = 0; step < 4; step++) await app.arrow("down");
    await app.enter();
    expect(app.frame()).toContain("Nouveau profil local");

    await app.type("Support");
    // Tab walks: name -> id -> description.
    await app.sequence(KeyCodes.TAB);
    await app.sequence(KeyCodes.TAB);
    await app.type("Pour le support");
    // description -> base -> level -> instructions
    await app.sequence(KeyCodes.TAB);
    await app.sequence(KeyCodes.TAB);
    await app.sequence(KeyCodes.TAB);
    await app.type("Reste factuel.");
    await app.chord("s");
    await app.waitUntil(() => !app.frame().includes("Enregistrement"), "la sauvegarde se termine");

    const stored = await readLocalProfile("support", profilesDir);
    expect(stored.name).toBe("Support");
    expect(stored.description).toBe("Pour le support");
    expect(stored.instructions).toBe("Reste factuel.");

    // The overlay is gone and the new profile is the selected one.
    const frame = app.frame();
    expect(frame).not.toContain("Nouveau profil local");
    expect(frame).toContain("support");
  }, 180_000);

  test("shows a validation message instead of writing an incomplete profile", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");
    for (let step = 0; step < 4; step++) await app.arrow("down");
    await app.enter();

    // Nothing typed at all: the save has to be refused, visibly.
    await app.chord("s");

    expect(app.frame()).toContain("obligatoire");
  }, 120_000);

  test("escape abandons the form without writing anything", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");
    for (let step = 0; step < 4; step++) await app.arrow("down");
    await app.enter();
    await app.type("Jetable");

    await app.sequence(KeyCodes.ESCAPE);

    expect(app.frame()).not.toContain("Nouveau profil local");
    await expectNoProfile("jetable");
  }, 120_000);
});

describe("editing and deleting a local profile", () => {
  beforeEach(async () => {
    await createLocalProfile(EXISTING, { profilesDir });
    await loadProfileCatalog({ profilesDir });
  });

  test("edits it and keeps the change on disk", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Support client");
    await app.chord("a");
    // "Modifier" is the first row and available on a local profile.
    await app.enter();
    expect(app.frame()).toContain("Modifier");

    await app.type(" niveau 2");
    await app.chord("s");
    await app.waitUntil(() => !app.frame().includes("Enregistrement"), "la sauvegarde se termine");

    const stored = await readLocalProfile("support-client", profilesDir);
    expect(stored.name).toBe("Support client niveau 2");
    // The id is never renamed by an edit.
    expect(stored.id).toBe("support-client");
  }, 180_000);

  test("asks before deleting, and deletes on confirmation", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Support client");
    await app.chord("a");
    // Rows: edit, duplicate, export, delete.
    for (let step = 0; step < 3; step++) await app.arrow("down");
    await app.enter();

    expect(app.frame()).toContain("Supprimer");
    // Still on disk while the question stands.
    expect(await readLocalProfile("support-client", profilesDir)).toBeDefined();

    await app.enter();
    await app.waitUntil(() => !app.frame().includes("Supprimer «"), "la suppression se termine");
    await expectNoProfile("support-client");
  }, 180_000);

  test("escape cancels the deletion and keeps the file", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Support client");
    await app.chord("a");
    for (let step = 0; step < 3; step++) await app.arrow("down");
    await app.enter();

    await app.sequence(KeyCodes.ESCAPE);

    expect(await readLocalProfile("support-client", profilesDir)).toBeDefined();
  }, 180_000);

  test("exports it to a real file", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Support client");
    await app.chord("a");
    for (let step = 0; step < 2; step++) await app.arrow("down");
    await app.enter();
    await app.waitUntil(() => !app.frame().includes("Exporter en JSON"), "l'export se termine");

    const written = await readFile(path.join(exportDir, "support-client.json"), "utf8");
    expect(JSON.parse(written)).toEqual(EXISTING);
  }, 180_000);

  test("duplicates it into a second, independent profile", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Support client");
    await app.chord("a");
    await app.arrow("down");
    await app.enter();
    expect(app.frame()).toContain("Dupliquer");

    // The form opens on the source's name with an empty id, so typing extends
    // the name and the id follows it — a duplicate cannot silently reuse the
    // id it was copied from.
    await app.type(" bis");
    await app.chord("s");
    await app.waitUntil(() => !app.frame().includes("Enregistrement"), "la sauvegarde se termine");

    const copy = await readLocalProfile("support-client-bis", profilesDir);
    expect(copy.name).toBe("Support client bis");
    expect(copy.instructions).toBe(EXISTING.instructions);
    expect(copy.extends).toBe("clean");
    // The source is untouched.
    expect((await readLocalProfile("support-client", profilesDir)).name).toBe("Support client");
  }, 180_000);
});

describe("using a local profile", () => {
  test("generates with the profile created in this session", async () => {
    const app = await mountApp();
    await openPickerOn(app, "Clean");
    await app.chord("a");
    for (let step = 0; step < 4; step++) await app.arrow("down");
    await app.enter();

    await app.type("Support");
    await app.sequence(KeyCodes.TAB);
    await app.sequence(KeyCodes.TAB);
    await app.type("Pour le support");
    await app.sequence(KeyCodes.TAB);
    await app.sequence(KeyCodes.TAB);
    await app.sequence(KeyCodes.TAB);
    await app.type("Reste factuel.");
    await app.chord("s");
    await app.waitUntil(() => !app.frame().includes("Enregistrement"), "la sauvegarde se termine");

    // Straight into a generation: the profile has to be usable, not just listed.
    await app.type("un prompt");
    await app.chord("g");

    expect(executed).toHaveLength(1);
    expect(executed[0]?.profileId).toBe("support");
  }, 240_000);
});
