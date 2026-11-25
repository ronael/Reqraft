import { describe, expect, it } from "vitest";
import {
  readAgentDraftArguments,
  toAgentDraftArguments,
} from "@/apps/cli/opentui/agent-draft-arguments.js";
import { availableCommands, type CommandContext } from "@/apps/cli/tui/model/commands.js";
import { routeKey } from "@/apps/cli/tui/model/keymap.js";
import { applyAgentDraftSettings, withAgentDraft } from "@/apps/cli/ui/agent-draft.js";
import { createInitialAppState } from "@/apps/cli/ui/app-state.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { getProfile } from "@/profiles/registry.js";

/**
 * `rp edit` opening the full interface on an agent's draft: the arguments
 * between the two processes, the starting state, and the command that sends
 * the result back.
 */

const WITH_RESULT: CommandContext = {
  hasOverlay: false,
  hasResult: true,
  isGenerating: false,
  inputLength: 12,
};

describe("les arguments entre rp edit et l'interface", () => {
  it("font l'aller-retour, même pour un chemin qui commence par un tiret", () => {
    for (const draft of [
      { file: "/Users/ada/.codex/.tmpA.md" },
      { file: "-bizarre.md", profile: "dev", level: "complete" },
    ]) {
      expect(readAgentDraftArguments(toAgentDraftArguments(draft))).toEqual(draft);
    }
  });

  it("ne voient aucun brouillon dans un rp ordinaire", () => {
    expect(readAgentDraftArguments([])).toBeNull();
    expect(readAgentDraftArguments(["--agent-draft="])).toBeNull();
  });
});

describe("l'état de départ", () => {
  it("met le brouillon dans l'éditeur, puis le profil et le niveau demandés", () => {
    const loaded = createInitialAppState(DEFAULT_CONFIG);
    const start = { draft: "corrige le bouton", profile: "auto", level: "minimal" };
    const state = applyAgentDraftSettings(withAgentDraft(loaded, start), start);
    expect(state.input).toBe("corrige le bouton");
    expect(state.profile).toBe("auto");
    expect(state.level).toBe("minimal");
  });

  it("ramène un alias au profil qu'il désigne, comme les sélecteurs", () => {
    const loaded = createInitialAppState(DEFAULT_CONFIG);
    const state = applyAgentDraftSettings(loaded, { draft: "x", profile: "web-designer" });
    expect(state.profile).toBe(getProfile("web-designer")?.id);
    expect(state.profile).not.toBe("web-designer");
  });

  it("ignore un profil ou un niveau inconnu, plutôt que de bloquer", () => {
    const loaded = createInitialAppState(DEFAULT_CONFIG);
    const state = applyAgentDraftSettings(loaded, { draft: "x", profile: "nope", level: "max" });
    expect(state.profile).toBe(loaded.profile);
    expect(state.level).toBe(loaded.level);
  });
});

describe("la commande Utiliser", () => {
  it("prend ^Y à la place de Copier, seulement pour un brouillon d'agent", () => {
    const ids = (context: CommandContext) => availableCommands(context).map((c) => c.id);
    expect(ids({ ...WITH_RESULT, agentDraft: true })).toContain("use");
    expect(ids({ ...WITH_RESULT, agentDraft: true })).not.toContain("copy");
    expect(ids(WITH_RESULT)).toContain("copy");
    expect(ids(WITH_RESULT)).not.toContain("use");

    const route = (context: CommandContext) =>
      routeKey({ ctrl: true, name: "y" }, { ...context, editorFocused: true });
    expect(route({ ...WITH_RESULT, agentDraft: true })).toEqual({ kind: "command", id: "use" });
    expect(route(WITH_RESULT)).toEqual({ kind: "command", id: "copy" });
  });

  it("attend la fin d'une réécriture en cours", () => {
    const ids = availableCommands({ ...WITH_RESULT, agentDraft: true, isGenerating: true });
    expect(ids.map((c) => c.id)).not.toContain("use");
  });
});
