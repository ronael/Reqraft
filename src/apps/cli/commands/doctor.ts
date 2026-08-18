import process from "node:process";
import { loadConfig, configPath as getConfigPath } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import type { ProviderAdapter } from "@/core/types.js";
import { createProvider } from "@/providers/registry.js";
import { hydrateCredentials } from "@/auth/credentials.js";
import { printKeyValue, printScreen } from "@/apps/cli/ui/text.js";
import {
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
  type BuiltinProvider,
} from "@/providers/catalog.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

interface DoctorOutput {
  log(message: string): void;
}

interface DoctorDependencies {
  env?: NodeJS.ProcessEnv;
  output?: DoctorOutput;
  loadConfig?: () => Promise<Config>;
  configPath?: () => string;
  hydrateCredentials?: (env: NodeJS.ProcessEnv) => Promise<void>;
  createProvider?: (
    id: BuiltinProvider,
    env: NodeJS.ProcessEnv,
    config?: Config,
  ) => ProviderAdapter;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

export async function runDoctor(
  dependencies: DoctorDependencies = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<void> {
  const output = dependencies.output ?? console;
  const config = await (dependencies.loadConfig ?? loadConfig)();
  const env = dependencies.env ?? process.env;
  await (dependencies.hydrateCredentials ?? hydrateCredentials)(env);

  printScreen("reqraft doctor", t("doctor.subtitle"), output);
  output.log(t("doctor.configuration"));
  printKeyValue(t("doctor.file"), (dependencies.configPath ?? getConfigPath)(), output);
  printKeyValue(t("doctor.provider"), config.defaultProvider, output);
  printKeyValue(t("doctor.model"), config.defaultModel, output);
  printKeyValue(t("doctor.profile"), config.defaultProfile, output);
  printKeyValue(t("doctor.timeout"), `${String(config.timeoutMs)} ms`, output);
  printKeyValue(
    t("doctor.maxOutput"),
    config.maxOutputTokens === undefined
      ? t("doctor.adaptive")
      : `${String(config.maxOutputTokens)} tokens`,
    output,
  );
  output.log("");

  output.log(t("doctor.apiKeys"));
  for (const definition of listCredentialProviders()) {
    const key = getProviderEnvName(definition.id);
    const present = env[key] ? t("doctor.configured") : t("doctor.notConfigured");
    output.log(`  ${definition.label.padEnd(10)} : ${present}`);
  }
  output.log("");

  output.log(t("doctor.providers"));
  for (const definition of listProviderDefinitions()) {
    const { id } = definition;
    try {
      const provider = (dependencies.createProvider ?? createProvider)(id, env, config);
      const health = await provider.validateConfiguration();
      const missing = health.missingConfiguration?.join(", ");
      const missingLabel =
        missing ??
        (isCredentialProvider(id) ? getProviderEnvName(id) : t("doctor.configurationValue"));
      const status = health.ok ? "OK" : t("doctor.missing", { value: missingLabel });
      output.log(`  ${definition.label.padEnd(20)} : ${status}`);
    } catch {
      output.log(`  ${id.padEnd(20)} : ${t("doctor.error")}`);
    }
  }
}
