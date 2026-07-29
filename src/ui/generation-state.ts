export interface GenerationState<Result> {
  error: string | null;
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
  error: string,
): State {
  return {
    ...state,
    error,
  };
}
