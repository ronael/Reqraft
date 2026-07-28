import { z } from "zod";
import type { RepromptLevel } from "../core/types.js";

export const ConfigSchema = z.object({
  defaultProvider: z.enum(["anthropic", "openai", "deepseek", "mistral", "openai-compatible", "mock"]).default("anthropic"),
  defaultModel: z.string().default("claude-haiku-4-5"),
  defaultProfile: z.string().default("auto"),
  defaultLevel: z.enum(["minimal", "standard", "complete"]).default("standard"),
  copyAfterGeneration: z.boolean().default(false),
  stream: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30000),
  showChanges: z.boolean().default(false),
  telemetry: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export function mergeConfig(
  defaults: Config,
  fileConfig: Partial<Config>,
  envConfig: Partial<Config>,
  cliConfig: Partial<Config>,
): Config {
  return ConfigSchema.parse({
    ...defaults,
    ...fileConfig,
    ...envConfig,
    ...cliConfig,
  });
}

export function configKeys(): (keyof Config)[] {
  return [
    "defaultProvider",
    "defaultModel",
    "defaultProfile",
    "defaultLevel",
    "copyAfterGeneration",
    "stream",
    "timeoutMs",
    "showChanges",
    "telemetry",
  ];
}

export function isValidLevel(level: string): level is RepromptLevel {
  return ["minimal", "standard", "complete"].includes(level);
}
