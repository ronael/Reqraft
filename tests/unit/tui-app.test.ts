import { describe, expect, it } from "vitest";
import { toResultState } from "@/apps/cli/tui/model/app-result.js";
import { statusBarCommands } from "@/apps/cli/tui/model/status-bar.js";
import { selectLevel, selectProfile, type AppState } from "@/apps/cli/ui/app-state.js";
import type { CommandContext } from "@/apps/cli/tui/model/commands.js";
import type { RepromptResult } from "@/core/types.js";

const RESULT: RepromptResult = {
  original: "prompt A",
  rewritten: "rewritten A",
  profile: "auto",
  level: "standard",
  provider: "mock",
  model: "mock-model",
  changes: [],
  quality: { status: "good", signals: [] },
  latencyMs: 100,
};

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    input: "",
    profile: "auto",
    level: "standard",
    levelPinned: false,
    provider: "mock",
    model: "mock-model",
    result: null,
    error: null,
    view: "result",
    modal: null,
    copied: false,
    ...overrides,
  };
}

const context: CommandContext = {
  hasOverlay: false,
  hasResult: false,
  isGenerating: false,
  inputLength: 4,
};

describe("toResultState · error precedence", () => {
  it("shows a current error even when a previous result still exists", () => {
    const app = state({
      result: RESULT,
      error: { title: "API key missing", message: "configure the provider" },
    });
    const result = toResultState(app, "error", "");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.title).toBe("API key missing");
    }
  });

  it("returns the success state once a run succeeds", () => {
    const result = toResultState(state({ result: RESULT }), "success", "");
    expect(result).toMatchObject({ kind: "success", original: "prompt A", text: "rewritten A" });
  });

  it("returns streaming with the partial text while streaming", () => {
    const result = toResultState(state(), "streaming", "half");
    expect(result).toEqual({ kind: "streaming", partial: "half" });
  });
});

describe("statusBarCommands · contextual footer", () => {
  it("never shows two commands bound to the same key (^C)", () => {
    const generating = statusBarCommands({ ...context, isGenerating: true }).map((c) => c.id);
    expect(generating).toContain("cancel");

    const idle = statusBarCommands(context).map((c) => c.id);
    expect(idle).not.toContain("cancel");
    expect(idle).not.toContain("exit");

    // Whatever the context, the footer advertises exactly one ^C command.
    for (const ctx of [
      { ...context, isGenerating: true },
      { ...context, hasResult: true },
      context,
    ]) {
      const ctrlC = statusBarCommands(ctx).filter((c) =>
        c.chords.some((chord) => chord.ctrl && chord.name === "c"),
      );
      expect(ctrlC.length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps result actions (copy/diff/explain) out of the footer", () => {
    const withResult = statusBarCommands({ ...context, hasResult: true }).map((c) => c.id);
    expect(withResult).toContain("reset");
    expect(withResult).not.toContain("copy");
    expect(withResult).not.toContain("toggle-diff");
    expect(withResult).not.toContain("show-explain");
  });

  it("advertises generate, commands and focus in the idle footer", () => {
    const ids = statusBarCommands(context).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["generate", "open-palette", "focus-next"]));
  });
});

describe("level follows the profile, but never overrules the user", () => {
  it("adopts the level of the profile being selected", () => {
    const next = selectProfile(state({ level: "standard" }), "clean", "minimal");
    expect(next.level).toBe("minimal");
  });

  it("keeps a level the user set by hand", () => {
    // Picking a profile after choosing a level must not silently undo that
    // choice; the header would change under the user with no explanation.
    const pinned = selectLevel(state(), "complete");
    expect(selectProfile(pinned, "clean", "minimal").level).toBe("complete");
  });

  it("leaves the level alone for a profile that declares none", () => {
    expect(selectProfile(state({ level: "standard" }), "auto").level).toBe("standard");
  });
});
