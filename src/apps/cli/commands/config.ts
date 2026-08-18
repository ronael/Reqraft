import { loadConfig, saveConfig, configPath } from "@/config/loader.js";
import { ConfigSchema, configKeys, parseConfigValue, type ConfigKey } from "@/config/schema.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";

interface ConfigOutput {
  log(message: string): void;
  error(message: string): void;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

export async function runConfig(
  action?: string,
  key?: string,
  value?: string,
  output: ConfigOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  try {
    switch (action) {
      case undefined:
      case "get":
        return await showConfig(key, output, t);
      case "set":
        if (!key || value === undefined) {
          output.error(t("config.setUsage"));
          return EXIT_CODES.INVALID_INPUT;
        }
        return await setConfig(key, value, output, t);
      case "path":
        output.log(configPath());
        return EXIT_CODES.SUCCESS;
      default:
        output.error(t("config.unknownAction", { action }));
        return EXIT_CODES.INVALID_INPUT;
    }
  } catch (error) {
    output.error(`${t("common.error")} : ${formatUiError(error, "config", t)}`);
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
}

async function showConfig(
  key: string | undefined,
  output: ConfigOutput,
  t: Translator,
): Promise<number> {
  const config = await loadConfig();
  if (key) {
    if (!isConfigKey(key)) {
      output.error(t("config.unknownKey", { key }));
      return EXIT_CODES.INVALID_CONFIGURATION;
    }
    output.log(String(config[key]));
  } else {
    output.log(JSON.stringify(config, null, 2));
  }
  return EXIT_CODES.SUCCESS;
}

async function setConfig(
  key: string,
  value: string,
  output: ConfigOutput,
  t: Translator,
): Promise<number> {
  if (!isConfigKey(key)) {
    output.error(t("config.unknownKey", { key }));
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
