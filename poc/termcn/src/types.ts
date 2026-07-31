export type RepromptLevel = "minimal" | "standard" | "complete";
export type ProviderId = "openai" | "anthropic" | "mistral" | "deepseek";
export type ProfileId =
  | "auto"
  | "clean"
  | "code"
  | "frontend"
  | "web-design"
  | "debug"
  | "review"
  | "writing";
export type TuiStatus = "idle" | "loading" | "streaming" | "success" | "error";
export type OverlayId = "profile" | "level" | "provider" | "model" | "help" | null;
export type FocusElement = "editor" | "result";

export interface Option<T extends string> {
  label: string;
  value: T;
  description?: string;
}

export interface TuiStats {
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
}

export interface TuiState {
  input: string;
  result: string;
  status: TuiStatus;
  profile: ProfileId;
  level: RepromptLevel;
  provider: ProviderId;
  model: string;
  activeOverlay: OverlayId;
  focusedElement: FocusElement;
  copied: boolean;
  warning?: string;
  error?: string;
  stats: TuiStats;
}

export interface TuiController {
  state: TuiState;
  setInput(input: string): void;
  setProfile(profile: ProfileId): void;
  setLevel(level: RepromptLevel): void;
  setProvider(provider: ProviderId): void;
  setModel(model: string): void;
  setOverlay(overlay: OverlayId): void;
  setFocus(focus: FocusElement): void;
  generate(input: string): Promise<void>;
  simulateError(): void;
  resetResult(): void;
  copyResult(): Promise<void>;
}
