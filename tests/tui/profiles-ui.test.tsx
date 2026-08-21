/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { SelectPicker } from "@/apps/cli/tui/components/SelectPicker.js";
import { ProfileActions, profileActions } from "@/apps/cli/tui/components/ProfileActions.js";
import { ProfileForm } from "@/apps/cli/tui/components/ProfileForm.js";
import { getProfileOptions } from "@/apps/cli/ui/modal-options.js";
import { EditorScreen } from "@/apps/cli/tui/screens/EditorScreen.js";
import { HelpOverlay } from "@/apps/cli/tui/components/HelpOverlay.js";
import { INITIAL_FOCUS } from "@/apps/cli/tui/model/focus.js";
import {
  createProfileForm,
  editProfileForm,
  moveField,
  setFieldValue,
} from "@/apps/cli/ui/profile-form.js";
import { loadProfileCatalog, resetProfileCatalog } from "@/profiles/catalog.js";
import { createLocalProfile } from "@/profiles/local-store.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { createTranslator } from "@/i18n/translate.js";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

registerRendererTeardown();

const t = createTranslator("fr");

const SCREEN = {
  width: "100%" as const,
  height: "100%" as const,
  backgroundColor: theme.tokens.color.background,
  position: "relative" as const,
};

const LOCAL = {
  schemaVersion: 1 as const,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  extends: "clean" as const,
  defaultLevel: "standard" as const,
  instructions: "Réponds avec empathie.\nEscalade si besoin.",
};

async function frameOf(node: React.ReactNode, width = 78, height = 30): Promise<string> {
  const setup = trackRenderer(
    await testRender(<box style={SCREEN}>{node}</box>, { width, height }),
  );
  await setup.flush();
  return setup.captureCharFrame();
}

describe("profile picker", () => {
  test("groups the profiles by origin and marks the local ones", async () => {
    const profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-tui-profiles-"));
    try {
      await createLocalProfile(LOCAL, { profilesDir });
      // The catalogue is filled once, off the render path: the picker reads it
      // from memory and never touches the disk while drawing.
      await loadProfileCatalog({ profilesDir });

      const options = getProfileOptions(t);
      const frame = await frameOf(
        <SelectPicker
          title="Changer de profil"
          open
          options={options}
          currentValue="clean"
          highlighted={0}
          terminalWidth={78}
          terminalHeight={30}
          t={t}
        />,
      );

      expect(frame).toContain("Profils intégrés");
      expect(frame).toContain("Profils locaux");
      expect(frame).toContain("Support client");
      // The origin is stated on the row too, not only by the group it sits in.
      expect(frame).toContain("Local");
    } finally {
      resetProfileCatalog();
      await rm(profilesDir, { recursive: true, force: true });
    }
  }, 60_000);

  test("keeps section headers out of the selectable index space", async () => {
    const profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-tui-index-"));
    try {
      await createLocalProfile(LOCAL, { profilesDir });
      await loadProfileCatalog({ profilesDir });

      const options = getProfileOptions(t);
      // The local profile, found by value rather than by counting: the list
      // ends with an action row, and hard-coding "last" would silently start
      // testing that row instead. If headers occupied indices, this highlight
      // would land on a section title.
      const localIndex = options.findIndex((option) => option.value === "support-client");
      expect(localIndex).toBeGreaterThanOrEqual(0);
      const frame = await frameOf(
        <SelectPicker
          title="Changer de profil"
          open
          options={options}
          currentValue="clean"
          highlighted={localIndex}
          terminalWidth={78}
          terminalHeight={30}
          t={t}
        />,
      );

      // The dialog title carries its own "›", so the assertion goes the other
      // way round: the row holding the local profile is the highlighted one.
      const row = frame.split("\n").find((line) => line.includes("Support client"));
      expect(row).toBeDefined();
      expect(row).toContain("›");
    } finally {
      resetProfileCatalog();
      await rm(profilesDir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("profile actions", () => {
  test("offers every action on a local profile", () => {
    const entries = profileActions(true, t);
    expect(entries.filter((entry) => entry.unavailable !== undefined)).toEqual([]);
  });

  test("marks edit and delete unavailable on a built-in", () => {
    const entries = profileActions(false, t);
    const blocked = entries
      .filter((entry) => entry.unavailable !== undefined)
      .map((entry) => entry.id);
    // Duplicate and export produce something new, so they stay available.
    // Editing, opening and deleting never are: a built-in ships inside the
    // binary, so there is no file to write to, open, or remove.
    expect(blocked).toEqual(["edit", "open", "delete"]);
  });

  test("states the reason rather than hiding the row", async () => {
    const frame = await frameOf(
      <ProfileActions
        open
        profileId="clean"
        isLocal={false}
        highlighted={0}
        terminalWidth={78}
        terminalHeight={20}
        t={t}
      />,
      78,
      20,
    );

    expect(frame).toContain("Modifier");
    expect(frame).toContain("Supprimer");
    expect(frame).toContain("profil intégré");
  }, 60_000);
});

describe("profile form", () => {
  test("shows every field, with the id derived from the name", async () => {
    let state = createProfileForm();
    state = setFieldValue(state, "name", "Support client");

    const frame = await frameOf(
      <ProfileForm
        open
        state={state}
        terminalWidth={78}
        terminalHeight={30}
        t={t}
        onInstructionsChange={() => undefined}
      />,
    );

    // "Niveau par défaut", not "Niveau": the profile suggests a level, the user
    // can still override it, and the CLI wizard already said so.
    for (const label of [
      "Nom",
      "Identifiant",
      "Description",
      "Base",
      "Niveau par défaut",
      "Instructions",
    ]) {
      expect(frame).toContain(label);
    }
    expect(frame).toContain("support-client");
    // An absent base is shown, not left blank and ambiguous.
    expect(frame).toContain("(vide)");
  }, 60_000);

  test("renders multiline instructions across rows", async () => {
    const frame = await frameOf(
      <ProfileForm
        open
        state={editProfileForm(LOCAL)}
        terminalWidth={78}
        terminalHeight={30}
        t={t}
        onInstructionsChange={() => undefined}
      />,
    );

    expect(frame).toContain("Réponds avec empathie.");
    expect(frame).toContain("Escalade si besoin.");
  }, 60_000);

  test("says the id cannot change while editing", async () => {
    const frame = await frameOf(
      <ProfileForm
        open
        state={editProfileForm(LOCAL)}
        terminalWidth={78}
        terminalHeight={30}
        t={t}
        onInstructionsChange={() => undefined}
      />,
    );

    expect(frame).toContain("non modifiable");
  }, 60_000);

  test("shows the base a profile inherits", async () => {
    const frame = await frameOf(
      <ProfileForm
        open
        state={editProfileForm(LOCAL)}
        terminalWidth={78}
        terminalHeight={30}
        t={t}
        onInstructionsChange={() => undefined}
      />,
    );

    expect(frame).toContain("clean");
  }, 60_000);
});

describe("discoverability", () => {
  test("the profile picker advertises how to manage profiles", async () => {
    // The feature was wired and tested before this line existed, and nobody
    // could find it: an overlay-scoped chord never reaches the status bar, so
    // the overlay itself has to say it.
    const frame = await frameOf(
      <EditorScreen
        width={92}
        height={40}
        prompt=""
        submittedPrompt={null}
        result={{ kind: "empty" }}
        view="result"
        focus={INITIAL_FOCUS}
        overlay={{ active: "profile", index: 0, query: "" }}
        settings={{ profile: "auto", level: "standard", provider: "openai", model: "gpt-5-mini" }}
        ready
        toast={null}
        t={t}
        onPromptChange={() => undefined}
        onCommand={() => undefined}
        onOverlaySelect={() => undefined}
      />,
      92,
      40,
    );

    expect(frame).toContain("^A");
    expect(frame).toContain("profils locaux");
  }, 60_000);

  test("the level picker does not advertise a chord that is inert there", async () => {
    const frame = await frameOf(
      <EditorScreen
        width={92}
        height={40}
        prompt=""
        submittedPrompt={null}
        result={{ kind: "empty" }}
        view="result"
        focus={INITIAL_FOCUS}
        overlay={{ active: "level", index: 0, query: "" }}
        settings={{ profile: "auto", level: "standard", provider: "openai", model: "gpt-5-mini" }}
        ready
        toast={null}
        t={t}
        onPromptChange={() => undefined}
        onCommand={() => undefined}
        onOverlaySelect={() => undefined}
      />,
      92,
      40,
    );

    expect(frame).not.toContain("profils locaux");
  }, 60_000);

  test("help lists the profile shortcuts", async () => {
    const frame = await frameOf(
      <HelpOverlay open terminalWidth={92} terminalHeight={40} t={t} />,
      92,
      40,
    );

    expect(frame).toContain("^A");
    expect(frame).toContain("^S");
  }, 60_000);
});

describe("form cursor", () => {
  const cursor = theme.tokens.glyph.cursor;

  async function formFrame(state: Parameters<typeof ProfileForm>[0]["state"]): Promise<string> {
    return frameOf(
      <ProfileForm
        open
        state={state}
        terminalWidth={78}
        terminalHeight={30}
        t={t}
        onInstructionsChange={() => undefined}
      />,
    );
  }

  test("marks where typing lands in the focused text field", async () => {
    // Without it the form looked unresponsive while it was in fact recording
    // every keystroke: the text appeared, but nothing said where the next
    // character would go.
    const state = setFieldValue(createProfileForm(), "name", "Support");
    expect(await formFrame(state)).toContain(`Support${cursor}`);
  });

  test("shows no cursor on a field changed with the arrows", async () => {
    let state = setFieldValue(createProfileForm(), "name", "Support");
    // name -> id -> description -> extends, which is a choice field.
    state = moveField(moveField(moveField(state, 1), 1), 1);
    const frame = await formFrame(state);

    const baseRow = frame.split("\n").find((row) => row.includes("(vide)"));
    expect(baseRow).toBeDefined();
    expect(baseRow).not.toContain(cursor);
  });

  test("shows no cursor on an id that cannot be edited", async () => {
    const frame = await formFrame(editProfileForm(LOCAL));
    const idRow = frame.split("\n").find((row) => row.includes("non modifiable"));
    expect(idRow).toBeDefined();
    expect(idRow).not.toContain(cursor);
  });

  test("shows the cursor alone on an empty focused field", async () => {
    // "(vide)" is a placeholder for a field nobody is typing into; on the
    // focused one it would sit where the typed text is about to appear.
    const frame = await formFrame(createProfileForm());
    const nameRow = frame.split("\n").findIndex((row) => row.includes("Nom"));
    expect(frame.split("\n")[nameRow + 1]).toContain(cursor);
    expect(frame.split("\n")[nameRow + 1]).not.toContain("(vide)");
  });
});
