import type { RepromptLevel } from "./levels.js";

export type { RepromptLevel };

export const FIDELITY_MODES = ["permissive", "balanced", "strict"] as const;
export type FidelityMode = (typeof FIDELITY_MODES)[number];
export const DEFAULT_FIDELITY_MODE = "balanced" satisfies FidelityMode;
export type QualityStatus = "good" | "review" | "risky";
export type QualitySeverity = "info" | "warning" | "critical";

export type UnsupportedAddition =
  | "testimonials"
  | "faq"
  | "cta"
  | "pricing"
  | "footer"
  | "header"
  | "responsive"
  | "seo"
  | "animations"
  | "authentication"
  | "database"
  | "color_palette"
  | "performance";

export type QualitySignal =
  | {
      code: "unsupported_additions";
      severity: "info" | "warning";
      params: { additions: UnsupportedAddition[] };
    }
  | {
      code: "disproportionate_expansion";
      severity: "info" | "warning";
    }
  /**
   * Des chemins ou des commandes que la demande ne contenait pas.
   *
   * Séparés des `unsupported_additions` : ceux-là viennent d'une liste de
   * termes produit, ceux-ci se vérifient — le chemin est dans la demande, ou il
   * n'y est pas — et ce qu'on affiche est ce qui a été inventé, pas une
   * catégorie.
   */
  | {
      code: "invented_paths";
      severity: "info" | "warning";
      params: { paths: string[] };
    }
  | {
      code: "invented_commands";
      severity: "info" | "warning";
      params: { commands: string[] };
    }
  | {
      code: "missing_technical_terms";
      severity: "info" | "warning";
      params: { terms: string[] };
    }
  /**
   * La demande est devenue un plan.
   *
   * Distinct de `disproportionate_expansion`, qui compte des mots : une phrase
   * peut devenir six puces sans grossir beaucoup, et c'est pourtant un
   * changement de nature.
   */
  | { code: "structural_inflation"; severity: "info" | "warning" }
  | { code: "output_truncated"; severity: "critical" }
  | { code: "model_warning"; severity: "warning"; detail: string }
  | { code: "unstructured_response"; severity: "warning" }
  | { code: "profile_detection_fallback"; severity: "info" };

export interface QualityAssessment {
  status: QualityStatus;
  signals: QualitySignal[];
}

export interface RepromptRequest {
  input: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  outputLanguage?: string;
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
  quality: QualityAssessment;
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
  signal?: AbortSignal;
  /**
   * Called with each fragment as it arrives, when `stream` is set.
   * Adapters that cannot stream simply never call it.
   */
  onDelta?: (chunk: string) => void;
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
  code?: "missing_configuration" | "unreachable" | "invalid_configuration";
  missingConfiguration?: string[];
  detail?: string;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  listModels?(signal?: AbortSignal): Promise<ModelInfo[]>;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  validateConfiguration(): Promise<ProviderHealth>;
}
