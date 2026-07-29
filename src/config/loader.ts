import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ConfigSchema, type Config } from "./schema.js";
import { getConfigPath } from "./paths.js";
import { REPROMPT_POLICY } from "../core/reprompt-policy.js";

export const DEFAULT_CONFIG: Config = {
  defaultProvider: "anthropic",
  defaultModel: "claude-haiku-4-5",
  defaultProfile: "auto",
  defaultLevel: "standard",
  copyAfterGeneration: false,
  stream: true,
  timeoutMs: REPROMPT_POLICY.runtime.defaultTimeoutMs,
  showChanges: false,
  showStats: false,
  fidelityMode: "balanced",
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

export async function saveConfig(config: Config, targetPath = getConfigPath()): Promise<void> {
  const validated = ConfigSchema.parse(config);
  const configDir = path.dirname(targetPath);
  await mkdir(configDir, { recursive: true, mode: 0o700 });

  const tempPath = path.join(
    configDir,
    `.config.${String(process.pid)}.${String(Date.now())}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  try {
    await writeFile(tempPath, JSON.stringify(validated, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export function configPath(): string {
  return getConfigPath();
}
