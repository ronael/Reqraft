import process from "node:process";
import { loadConfig, saveConfig, configPath } from "../config/loader.js";
import { ConfigSchema, configKeys, type ConfigKey } from "../config/schema.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

export async function runConfig(action?: string, key?: string, value?: string): Promise<void> {
  try {
    switch (action) {
      case undefined:
      case "get":
        await showConfig(key);
        break;
      case "set":
        if (!key || value === undefined) {
          console.error("Usage : rp config set <clé> <valeur>");
          process.exit(EXIT_CODES.INVALID_INPUT);
        }
        await setConfig(key, value);
        break;
      case "path":
        console.log(configPath());
        break;
      default:
        console.error(`Action inconnue : ${action}. Actions : get, set, path`);
        process.exit(EXIT_CODES.INVALID_INPUT);
    }
  } catch (error) {
    console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_CODES.INVALID_CONFIGURATION);
  }
}

async function showConfig(key?: string): Promise<void> {
  const config = await loadConfig();
  if (key) {
    if (!isConfigKey(key)) {
      console.error(`Clé inconnue : ${key}`);
      process.exit(EXIT_CODES.INVALID_CONFIGURATION);
    }
    console.log(String(config[key]));
  } else {
    console.log(JSON.stringify(config, null, 2));
  }
}

async function setConfig(key: string, value: string): Promise<void> {
  if (!isConfigKey(key)) {
    console.error(`Clé inconnue : ${key}`);
    process.exit(EXIT_CODES.INVALID_CONFIGURATION);
  }
  const config = await loadConfig();
  const parsedValue = parseValue(key, value);
  const updated = { ...config, [key]: parsedValue };

  // Validate the whole config before saving.
  ConfigSchema.parse(updated);
  await saveConfig(updated);
  console.log(`${key} = ${value}`);
}

function parseValue(key: ConfigKey, value: string): unknown {
  switch (key) {
    case "copyAfterGeneration":
    case "stream":
    case "showChanges":
    case "telemetry":
      return value === "true";
    case "timeoutMs":
      return Number(value);
    default:
      return value;
  }
}

function isConfigKey(key: string): key is ConfigKey {
  return configKeys().includes(key as ConfigKey);
}
