import type { Config } from "@/config/schema.js";
import type { RepromptLevel, RepromptResult } from "@/core/types.js";
import type { ResultViewMode } from "./result-view.js";
import type { UiError } from "@/shared/errors.js";

export type ViewMode = ResultViewMode;
export type ModalType = "profile" | "level" | "provider" | "model" | "commands" | "help" | null;

export interface AppDefaults {
  defaultProfile: string;
  defaultLevel: RepromptLevel;
  defaultProvider: string;
  defaultModel: string;
}

export interface AppState {
  input: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  result: RepromptResult | null;
  error: UiError | null;
  view: ViewMode;
  modal: ModalType;
  copied: boolean;
  /**
   * True once the level was chosen deliberately in this session.
   *
   * A profile suggests its level; it never takes one back. Without this flag,
   * picking a profile after setting the level would silently undo a decision
   * the user had just made.
   */
  levelPinned: boolean;
}

export function createInitialAppState(defaults: AppDefaults): AppState {
  return {
    input: "",
    profile: defaults.defaultProfile,
    level: defaults.defaultLevel,
    provider: defaults.defaultProvider,
    model: defaults.defaultModel,
    result: null,
    error: null,
    view: "result",
    modal: null,
    copied: false,
    levelPinned: false,
  };
}

export function applyLoadedConfig(
  state: AppState,
  config: Config,
  error: UiError | null,
): AppState {
  return {
    ...state,
    provider: config.defaultProvider,
    model: config.defaultModel,
    profile: config.defaultProfile,
    level: config.defaultLevel,
    error: error ?? state.error,
  };
}

export function closeModal(state: AppState): AppState {
  return { ...state, modal: null };
}

/**
 * Selects a profile, adopting the level it declares.
 *
 * The profile only suggests: a level the user set by hand stays put. That order
 * matches the prompt itself, which tells the model the requested level outranks
 * the profile.
 */
export function selectProfile(
  state: AppState,
  profile: string,
  profileLevel?: RepromptLevel,
): AppState {
  const level = state.levelPinned ? state.level : (profileLevel ?? state.level);
  return { ...state, profile, level, modal: null };
}

export function selectLevel(state: AppState, level: RepromptLevel): AppState {
  return { ...state, level, levelPinned: true, modal: null };
}

export function selectProvider(state: AppState, provider: string, fallbackModel: string): AppState {
  return { ...state, provider, model: fallbackModel, modal: null };
}

export function selectModel(state: AppState, model: string): AppState {
  return { ...state, model, modal: null };
}

export function updatePromptInput(state: AppState, input: string): AppState {
  return { ...state, input };
}

export function clearCopyToast(state: AppState): AppState {
  return { ...state, copied: false };
}

export function resetSession(state: AppState): AppState {
  return {
    ...state,
    input: "",
    result: null,
    error: null,
    view: "result",
    modal: null,
    copied: false,
  };
}

export function pinInput(state: AppState, input: string, patch: Partial<AppState>): AppState {
  return { ...state, input, ...patch };
}

export function openModal(state: AppState, modal: NonNullable<ModalType>): AppState {
  return { ...state, modal };
}

export function showView(state: AppState, view: ViewMode): AppState {
  return { ...state, view, modal: null };
}

/**
 * Turns a secondary view on, or back off.
 *
 * One rule for diff and explain: pressing the same chord twice returns to the
 * result. They used to differ — diff toggled while explain only ever switched
 * on — so Ctrl+E was a one-way door, and leaving explain meant pressing Ctrl+D
 * twice to get back through a view you had not asked for.
 *
 * From another secondary view the chord switches to the requested one rather
 * than to the result: asking for the diff while reading the explanation means
 * "show me the diff", not "show me nothing".
 */
export function toggleView(state: AppState, target: ViewMode, input = state.input): AppState {
  return {
    ...state,
    input,
    view: state.view === target ? "result" : target,
  };
}

export function completeGeneration(state: AppState, result: RepromptResult): AppState {
  return { ...state, result, view: "result" };
}
