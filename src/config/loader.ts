import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ConfigSchema, type Config } from "./schema.js";
import { getConfigPath } from "./paths.js";
import { ReqraftError } from "../core/errors.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

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
  const configDir = path.dirname(targetPath);
  await mkdir(configDir, { recursive: true, mode: 0o700 });

  const tempPath = path.join(
    configDir,
    // Unpredictable suffix: the temp file is written with the user's config
    // before being renamed, so its name must not be guessable by another process.
    `.config.${String(process.pid)}.${String(Date.now())}.${randomUUID()}.tmp`,
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
