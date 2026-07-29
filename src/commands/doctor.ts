import process from "node:process";
import { loadConfig, configPath as getConfigPath } from "../config/loader.js";
import type { Config } from "../config/schema.js";
import type { ProviderAdapter } from "../core/types.js";
import { createProvider } from "../providers/registry.js";
import { hydrateCredentials } from "../auth/credentials.js";
import { printKeyValue, printScreen } from "../ui/text.js";
import {
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
  type BuiltinProvider,
} from "../providers/catalog.js";

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

export async function runDoctor(dependencies: DoctorDependencies = {}): Promise<void> {
  const output = dependencies.output ?? console;
  const config = await (dependencies.loadConfig ?? loadConfig)();
  const env = dependencies.env ?? process.env;
  await (dependencies.hydrateCredentials ?? hydrateCredentials)(env);

  printScreen("reqraft doctor", "État de la configuration et des providers", output);
  output.log("Configuration");
  printKeyValue("Fichier", (dependencies.configPath ?? getConfigPath)(), output);
  printKeyValue("Provider", config.defaultProvider, output);
  printKeyValue("Modèle", config.defaultModel, output);
  printKeyValue("Profil", config.defaultProfile, output);
  printKeyValue("Timeout", `${String(config.timeoutMs)} ms`, output);
  printKeyValue(
    "Sortie max.",
    config.maxOutputTokens === undefined
      ? "adaptative"
      : `${String(config.maxOutputTokens)} tokens`,
    output,
  );
  output.log("");

  output.log("Clés API");
  for (const definition of listCredentialProviders()) {
    const key = getProviderEnvName(definition.id);
    const present = env[key] ? "configuré" : "non configuré";
    output.log(`  ${definition.label.padEnd(10)} : ${present}`);
  }
  output.log("");

  output.log("Providers");
  for (const definition of listProviderDefinitions()) {
    const { id } = definition;
    try {
      const provider = (dependencies.createProvider ?? createProvider)(id, env, config);
      const health = await provider.validateConfiguration();
      const missing = health.missingConfiguration?.join(", ");
      const missingLabel =
        missing ?? (isCredentialProvider(id) ? getProviderEnvName(id) : "configuration");
      const status = health.ok ? "OK" : `manque ${missingLabel}`;
      output.log(`  ${definition.label.padEnd(20)} : ${status}`);
    } catch {
      output.log(`  ${id.padEnd(20)} : erreur`);
    }
  }
}
