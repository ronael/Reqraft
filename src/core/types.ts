export type RepromptLevel = "minimal" | "standard" | "complete";

export interface RepromptRequest {
  input: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  language?: string;
  includeChanges: boolean;
}

export interface RepromptResult {
  original: string;
  rewritten: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  changes: string[];
  warnings: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    visibleOutputTokens?: number;
    estimatedCost?: number;
    currency?: string;
  };
  latencyMs?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface ProviderRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

export interface ProviderResponse {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    visibleOutputTokens?: number;
  };
  model?: string;
  finishReason?: string;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
  missingConfiguration?: string[];
}

export interface ProviderAdapter {
  id: string;
  name: string;
  listModels?(): Promise<ModelInfo[]>;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  validateConfiguration(): Promise<ProviderHealth>;
}
