import type { RepromptLevel } from "@/core/types.js";

export interface PromptProfile {
  id: string;
  name: string;
  description: string;
  aliases?: string[];
  detect?: (input: string) => number;
  instructions: string;
  defaultLevel: RepromptLevel;
}
