import { loadConfig, saveConfig, configPath } from "../config/loader.js";
import { ConfigSchema, configKeys, parseConfigValue, type ConfigKey } from "../config/schema.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

interface ConfigOutput {
  log(message: string): void;
  error(message: string): void;
}

export async function runConfig(
  action?: string,
  key?: string,
  value?: string,
  output: ConfigOutput = console,
): Promise<number> {
  try {
    switch (action) {
      case undefined:
      case "get":
        return await showConfig(key, output);
      case "set":
        if (!key || value === undefined) {
          output.error("Usage : rp config set <clé> <valeur>");
          return EXIT_CODES.INVALID_INPUT;
        }
        return await setConfig(key, value, output);
      case "path":
        output.log(configPath());
        return EXIT_CODES.SUCCESS;
      default:
        output.error(`Action inconnue : ${action}. Actions : get, set, path`);
        return EXIT_CODES.INVALID_INPUT;
    }
  } catch (error) {
    output.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
}

async function showConfig(key: string | undefined, output: ConfigOutput): Promise<number> {
  const config = await loadConfig();
  if (key) {
    if (!isConfigKey(key)) {
      output.error(`Clé inconnue : ${key}`);
      return EXIT_CODES.INVALID_CONFIGURATION;
    }
    output.log(String(config[key]));
  } else {
    output.log(JSON.stringify(config, null, 2));
  }
  return EXIT_CODES.SUCCESS;
}

async function setConfig(key: string, value: string, output: ConfigOutput): Promise<number> {
  if (!isConfigKey(key)) {
    output.error(`Clé inconnue : ${key}`);
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
  const config = await loadConfig();
  const parsedValue = parseConfigValue(key, value);
  const updated = { ...config, [key]: parsedValue };

  // Validate the whole config before saving.
  ConfigSchema.parse(updated);
  await saveConfig(updated);
  output.log(`${key} = ${value}`);
  return EXIT_CODES.SUCCESS;
}

function isConfigKey(key: string): key is ConfigKey {
  return configKeys().includes(key as ConfigKey);
}
