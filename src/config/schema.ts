import { z } from "zod";
import type { RepromptLevel } from "../core/types.js";
import { REPROMPT_POLICY } from "../core/reprompt-policy.js";
import { BUILTIN_PROVIDER_IDS, OPENAI_COMPATIBLE_PROVIDER_ID } from "../providers/catalog.js";

const BooleanConfigSchema = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const OpenAICompatibleProviderConfigSchema = z
  .object({
    type: z.literal(OPENAI_COMPATIBLE_PROVIDER_ID),
    name: z.string().optional(),
    baseUrl: z.string().min(1),
    apiKeyEnv: z.string().min(1).optional(),
    customHeaders: z.record(z.string()).optional(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    defaultProvider: z.enum(BUILTIN_PROVIDER_IDS).default("anthropic"),
    defaultModel: z.string().default("claude-haiku-4-5"),
    defaultProfile: z.string().default("auto"),
    defaultLevel: z.enum(["minimal", "standard", "complete"]).default("standard"),
    copyAfterGeneration: z.boolean().default(false),
    stream: z.boolean().default(true),
    timeoutMs: z.number().int().positive().default(REPROMPT_POLICY.runtime.defaultTimeoutMs),
    maxOutputTokens: z.number().int().positive().optional(),
    showChanges: z.boolean().default(false),
    showStats: BooleanConfigSchema.default(false),
    fidelityMode: z.enum(["permissive", "balanced", "strict"]).default("balanced"),
    telemetry: z.boolean().default(false),
    providers: z.record(OpenAICompatibleProviderConfigSchema).optional(),
  })
  .passthrough();

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

const CONFIG_KEYS = [
  "defaultProvider",
  "defaultModel",
  "defaultProfile",
  "defaultLevel",
  "copyAfterGeneration",
  "stream",
  "timeoutMs",
  "maxOutputTokens",
  "showChanges",
  "showStats",
  "fidelityMode",
  "telemetry",
] as const;

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

export function configKeys(): ConfigKey[] {
  return [...CONFIG_KEYS];
}

export function isValidLevel(level: string): level is RepromptLevel {
  return ["minimal", "standard", "complete"].includes(level);
}
