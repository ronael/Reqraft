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

export function selectProfile(state: AppState, profile: string): AppState {
  return { ...state, profile, modal: null };
}

export function selectLevel(state: AppState, level: RepromptLevel): AppState {
  return { ...state, level, modal: null };
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

export function toggleDiffView(state: AppState, input: string): AppState {
  return {
    ...state,
    input,
    view: state.view === "diff" ? "result" : "diff",
  };
}

export function completeGeneration(state: AppState, result: RepromptResult): AppState {
  return { ...state, result, view: "result" };
}
