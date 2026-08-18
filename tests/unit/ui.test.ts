import { describe, expect, it } from "vitest";
import {
  applyLoadedConfig,
  clearCopyToast,
  closeModal,
  completeGeneration,
  createInitialAppState,
  openModal,
  pinInput,
  resetSession,
  selectLevel,
  selectModel,
  selectProfile,
  selectProvider,
  showView,
  toggleDiffView,
  updatePromptInput,
} from "@/apps/cli/ui/app-state.js";
import { createUiRepromptInput, resolveUiStreamPreference } from "@/apps/cli/ui/app-actions.js";
import { resolveCommandIntent } from "@/apps/cli/ui/command-intents.js";
import {
  getCommandOptions,
  getFallbackModelForProvider,
  getModelOptions,
  getProviderOptions,
  getProfileOptions,
  HELP_OPTIONS,
  LEVEL_OPTIONS,
} from "@/apps/cli/ui/modal-options.js";
import { formatDiff, formatExplain, formatResultView } from "@/apps/cli/ui/result-view.js";
import { getEmptyStateTitle, getModalTitle, getResultTitle } from "@/apps/cli/ui/view-labels.js";
import type { RepromptResult } from "@/core/types.js";
import { qualitySignalViewKey } from "@/apps/cli/ui/quality.js";
import {
  beginGeneration,
  canStartGeneration,
  completeCopy,
  failCopy,
  failGeneration,
} from "@/apps/cli/ui/generation-state.js";
import type { UiError } from "@/shared/errors.js";

const OLD_ERROR: UiError = { title: "Erreur", message: "ancienne erreur" };
const NEW_ERROR: UiError = { title: "Erreur", message: "nouvelle erreur" };
const COPY_ERROR: UiError = { title: "Erreur", message: "copie impossible" };

// Layout sizing lives in tests/unit/responsive.test.ts, colour and symbol
// fallbacks in tests/unit/theme.test.ts.

describe("quality notice", () => {
  it("keeps React keys unique when several model warnings share the same code", () => {
    const first = qualitySignalViewKey(
      { code: "model_warning", severity: "warning", detail: "Premier warning" },
      0,
    );
    const second = qualitySignalViewKey(
      { code: "model_warning", severity: "warning", detail: "Second warning" },
      1,
    );

    expect(first).not.toBe(second);
  });
});

describe("result view formatting", () => {
  const result: RepromptResult = {
    original: "corrige ceci\nmerci",
    rewritten: "Corrige ceci, merci.",
    profile: "auto",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: ["Correction de la casse.", "Ponctuation ajoutée."],
    quality: {
      status: "review",
      signals: [{ code: "model_warning", severity: "warning", detail: "Ambiguïté conservée." }],
    },
  };

  it("returns the rewritten prompt for the result view", () => {
    expect(formatResultView(result, "result")).toBe("Corrige ceci, merci.");
  });

  it("formats changed lines as a compact diff", () => {
    expect(formatDiff(result.original, result.rewritten)).toBe(
      "- corrige ceci\n+ Corrige ceci, merci.\n- merci\n+ ",
    );
  });

  it("formats changes and warnings for the explain view", () => {
    expect(formatExplain(result)).toBe(
      [
        "Modifications :",
        "- Correction de la casse.",
        "- Ponctuation ajoutée.",
        "",
        "Avertissements :",
        "- Ambiguïté conservée.",
      ].join("\n"),
    );
  });
});

describe("modal options", () => {
  it("keeps level and help options centralized", () => {
    expect(LEVEL_OPTIONS.map((option) => option.value)).toEqual([
      "minimal",
      "standard",
      "complete",
    ]);
    expect(HELP_OPTIONS.map((option) => option.value)).toContain("reset");
  });

  it("builds profile and model choices from registries", () => {
    expect(getProfileOptions()[0]).toEqual({ label: "auto (détection)", value: "auto" });
    expect(getModelOptions("openai").map((option) => option.value)).toContain("gpt-4.1-mini");
    expect(getFallbackModelForProvider("openai")).toBe("gpt-4.1-mini");
  });

  it("builds provider choices from the central provider catalog", () => {
    expect(getProviderOptions()).toContainEqual({ label: "openai — OpenAI", value: "openai" });
    expect(getProviderOptions()).toContainEqual({
      label: "anthropic — Anthropic",
      value: "anthropic",
    });
  });

  it("only exposes result actions after a generation exists", () => {
    expect(getCommandOptions(false).map((option) => option.value)).not.toContain("copy");
    expect(getCommandOptions(true).map((option) => option.value)).toEqual([
      "generate",
      "profile",
      "level",
      "provider",
      "model",
      "result",
      "diff",
      "explain",
      "copy",
    ]);
  });
});

describe("command intents", () => {
  it("routes command palette actions without string casts in the TUI", () => {
    expect(resolveCommandIntent("profile")).toEqual({ type: "open-modal", modal: "profile" });
    expect(resolveCommandIntent("model")).toEqual({ type: "open-modal", modal: "model" });
    expect(resolveCommandIntent("generate")).toEqual({ type: "generate" });
    expect(resolveCommandIntent("copy")).toEqual({ type: "copy" });
    expect(resolveCommandIntent("diff")).toEqual({ type: "show-view", view: "diff" });
  });
});

describe("view labels", () => {
  it("keeps section titles centralized by view and modal", () => {
    expect(getResultTitle("result")).toBe("Prompt amélioré");
    expect(getResultTitle("diff")).toBe("Diff");
    expect(getEmptyStateTitle("explain")).toBe(
      "L’explication sera disponible après une génération.",
    );
    expect(getModalTitle("commands")).toBe("Palette d’actions");
  });
});

describe("app state transitions", () => {
  const defaults = {
    defaultProfile: "auto",
    defaultLevel: "standard" as const,
    defaultProvider: "openai",
    defaultModel: "gpt-4.1-mini",
  };

  const result: RepromptResult = {
    original: "test",
    rewritten: "Test.",
    profile: "auto",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: [],
    quality: { status: "good", signals: [] },
  };

  it("creates and hydrates the TUI state from config", () => {
    const initial = createInitialAppState(defaults);
    const loaded = applyLoadedConfig(
      { ...initial, error: OLD_ERROR },
      {
        defaultProfile: "code",
        defaultLevel: "complete",
        defaultProvider: "mock",
        defaultModel: "mock-model",
        providers: {},
        stream: true,
        showStats: true,
        showChanges: true,
        copyAfterGeneration: false,
        telemetry: false,
        uiLocale: "auto",
        outputLanguage: "auto",
        fidelityMode: "balanced",
        timeoutMs: 30_000,
      },
      null,
    );

    expect(initial).toMatchObject({
      input: "",
      profile: "auto",
      provider: "openai",
      model: "gpt-4.1-mini",
      view: "result",
      modal: null,
    });
    expect(loaded).toMatchObject({
      profile: "code",
      level: "complete",
      provider: "mock",
      model: "mock-model",
      error: OLD_ERROR,
    });
  });

  it("keeps provider and modal transitions explicit", () => {
    const state = openModal(createInitialAppState(defaults), "provider");
    const selected = selectProvider(state, "mistral", "mistral-small-2603");

    expect(selected).toMatchObject({
      provider: "mistral",
      model: "mistral-small-2603",
      modal: null,
    });
    expect(selectProfile(state, "frontend").profile).toBe("frontend");
    expect(selectLevel(state, "minimal").level).toBe("minimal");
    expect(selectModel(state, "gpt-5-mini").model).toBe("gpt-5-mini");
    expect(closeModal(state).modal).toBeNull();
  });

  it("handles input, views, copy toast and generation completion", () => {
    const state = {
      ...createInitialAppState(defaults),
      input: "ancienne",
      modal: "commands" as const,
      copied: true,
      view: "result" as const,
    };

    expect(updatePromptInput(state, "nouvelle").input).toBe("nouvelle");
    expect(clearCopyToast(state).copied).toBe(false);
    expect(pinInput(state, "courante", { modal: "help" })).toMatchObject({
      input: "courante",
      modal: "help",
    });
    expect(showView(state, "explain")).toMatchObject({ view: "explain", modal: null });
    expect(toggleDiffView(state, "courante")).toMatchObject({
      input: "courante",
      view: "diff",
    });
    expect(completeGeneration(state, result)).toMatchObject({ result, view: "result" });
  });

  it("resets transient session data without changing the selected context", () => {
    const state = {
      ...createInitialAppState(defaults),
      input: "prompt courant",
      result,
      error: OLD_ERROR,
      modal: "help" as const,
      copied: true,
      view: "explain" as const,
      provider: "mistral",
      model: "mistral-small-2603",
      profile: "code",
      level: "complete" as const,
    };

    expect(resetSession(state)).toEqual({
      ...state,
      input: "",
      result: null,
      error: null,
      modal: null,
      copied: false,
      view: "result",
    });
  });
});

describe("app action inputs", () => {
  it("builds the shared reprompt use-case input from TUI state and config", () => {
    const state = {
      ...createInitialAppState({
        defaultProfile: "auto",
        defaultLevel: "standard",
        defaultProvider: "openai",
        defaultModel: "gpt-4.1-mini",
      }),
      input: "corrige ça",
      profile: "frontend",
      level: "complete" as const,
      provider: "mock",
      model: "mock-model",
    };

    const input = createUiRepromptInput(
      state,
      {
        defaultProfile: "frontend",
        defaultLevel: "complete",
        defaultProvider: "mock",
        defaultModel: "mock-model",
        providers: {},
        stream: true,
        showStats: true,
        showChanges: true,
        copyAfterGeneration: false,
        telemetry: false,
        uiLocale: "auto",
        outputLanguage: "auto",
        fidelityMode: "strict",
        timeoutMs: 12_000,
        maxOutputTokens: 900,
      },
      { OPENAI_API_KEY: "redacted" },
    );

    expect(input).toMatchObject({
      input: "corrige ça",
      profileId: "frontend",
      level: "complete",
      providerId: "mock",
      requestedModel: "mock-model",
      defaultModel: "mock-model",
      stream: true,
      fidelityMode: "strict",
      timeoutMs: 12_000,
      maxOutputTokens: 900,
    });
    expect(input.env.OPENAI_API_KEY).toBe("redacted");
  });

  it("falls back to the default stream preference before config is loaded", () => {
    expect(resolveUiStreamPreference(null)).toBe(true);
  });
});

describe("generation state", () => {
  it("does not start empty or concurrent generations", () => {
    expect(canStartGeneration("", false)).toBe(false);
    expect(canStartGeneration("   ", false)).toBe(false);
    expect(canStartGeneration("corrige ça", true)).toBe(false);
    expect(canStartGeneration("corrige ça", false)).toBe(true);
  });

  it("keeps the previous result visible while a new request starts or fails", () => {
    const previous = { rewritten: "Résultat payé" };
    const started = beginGeneration({ error: OLD_ERROR, result: previous, modal: null });
    const failed = failGeneration(started, NEW_ERROR);

    expect(started).toEqual({ error: null, result: previous, modal: null });
    expect(failed).toEqual({ error: NEW_ERROR, result: previous, modal: null });
  });
});

describe("clipboard state", () => {
  it("marks a successful copy and optionally closes the modal", () => {
    const copied = completeCopy({ copied: false, error: OLD_ERROR, modal: "commands" }, true);

    expect(copied).toEqual({ copied: true, error: null, modal: null });
  });

  it("surfaces copy failures without changing the current modal", () => {
    const failed = failCopy({ copied: true, error: null, modal: "commands" }, COPY_ERROR);

    expect(failed).toEqual({ copied: false, error: COPY_ERROR, modal: "commands" });
  });
});
