import type { UiError } from "@/shared/errors.js";

export interface GenerationState<Result> {
  error: UiError | null;
  result: Result | null;
}

export function canStartGeneration(input: string, isLoading: boolean): boolean {
  return input.trim().length > 0 && !isLoading;
}

export function beginGeneration<Result, State extends GenerationState<Result>>(
  state: State,
): State {
  return {
    ...state,
    error: null,
  };
}

export function failGeneration<Result, State extends GenerationState<Result>>(
  state: State,
  error: UiError,
): State {
  return {
    ...state,
    error,
  };
}

export interface ClipboardState {
  copied: boolean;
  error: UiError | null;
  modal: unknown;
}

export function completeCopy<State extends ClipboardState>(
  state: State,
  dismissModal: boolean,
): State {
  return {
    ...state,
    copied: true,
    error: null,
    modal: dismissModal ? null : state.modal,
  };
}

export function failCopy<State extends ClipboardState>(state: State, error: UiError): State {
  return {
    ...state,
    copied: false,
    error,
  };
}
