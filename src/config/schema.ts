import { z } from "zod";
import { DEFAULT_REPROMPT_LEVEL, RepromptLevelSchema, type RepromptLevel } from "../core/levels.js";
import { REPROMPT_POLICY } from "../core/reprompt-policy.js";
import { DEFAULT_FIDELITY_MODE, FIDELITY_MODES } from "../core/types.js";
import { DEFAULT_MODEL_ID } from "../models/presets.js";
import { AUTO_PROFILE_ID } from "../profiles/profile-ids.js";
import {
  BUILTIN_PROVIDER_IDS,
  DEFAULT_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "../providers/catalog.js";

export const DEFAULT_PROFILE_ID = AUTO_PROFILE_ID;

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
    defaultProvider: z.enum(BUILTIN_PROVIDER_IDS).default(DEFAULT_PROVIDER_ID),
    defaultModel: z.string().default(DEFAULT_MODEL_ID),
    defaultProfile: z.string().default(DEFAULT_PROFILE_ID),
    defaultLevel: RepromptLevelSchema.default(DEFAULT_REPROMPT_LEVEL),
    copyAfterGeneration: z.boolean().default(false),
    stream: z.boolean().default(true),
    timeoutMs: z.number().int().positive().default(REPROMPT_POLICY.runtime.defaultTimeoutMs),
    maxOutputTokens: z.number().int().positive().optional(),
    showChanges: z.boolean().default(false),
    showStats: BooleanConfigSchema.default(false),
    fidelityMode: z.enum(FIDELITY_MODES).default(DEFAULT_FIDELITY_MODE),
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

const BOOLEAN_CONFIG_KEYS = [
  "copyAfterGeneration",
  "stream",
  "showChanges",
  "showStats",
  "telemetry",
] as const satisfies readonly ConfigKey[];

const NUMBER_CONFIG_KEYS = ["timeoutMs", "maxOutputTokens"] as const satisfies readonly ConfigKey[];

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

export function parseConfigValue(key: ConfigKey, value: string): unknown {
  if (BOOLEAN_CONFIG_KEYS.includes(key as (typeof BOOLEAN_CONFIG_KEYS)[number])) {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${key} attend true ou false.`);
  }

  if (NUMBER_CONFIG_KEYS.includes(key as (typeof NUMBER_CONFIG_KEYS)[number])) {
    return Number(value);
  }

  return value;
}

export function isValidLevel(level: string): level is RepromptLevel {
  return RepromptLevelSchema.safeParse(level).success;
}
