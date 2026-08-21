import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ConfigSchema, type Config } from "./schema.js";
import { getConfigPath } from "./paths.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { writeAtomicFile } from "@/utils/atomic-write.js";

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

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
    throw new ReqraftError("config.invalid", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { path: configPath },
      cause: error,
    });
  }
}

export async function saveConfig(config: Config, targetPath = getConfigPath()): Promise<void> {
  const validated = ConfigSchema.parse(config);
  await writeAtomicFile(targetPath, JSON.stringify(validated, null, 2) + "\n", {
    mode: 0o600,
    dirMode: 0o700,
  });
}

export function configPath(): string {
  return getConfigPath();
}
