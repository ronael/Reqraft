import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ConfigSchema, type Config } from "./schema.js";
import { getConfigDir, getConfigPath } from "./paths.js";

export const DEFAULT_CONFIG: Config = {
  defaultProvider: "anthropic",
  defaultModel: "claude-haiku-4-5",
  defaultProfile: "auto",
  defaultLevel: "standard",
  copyAfterGeneration: false,
  stream: true,
  timeoutMs: 30000,
  showChanges: false,
  telemetry: false,
};

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = await readFile(configPath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return ConfigSchema.parse(parsed);
  } catch (error) {
    throw new Error(
      `Configuration corrompue (${configPath}) : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configDir = getConfigDir();
  await mkdir(configDir, { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function configPath(): string {
  return getConfigPath();
}
