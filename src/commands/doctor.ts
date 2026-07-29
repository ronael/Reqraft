import process from "node:process";
import { loadConfig, configPath } from "../config/loader.js";
import { createProvider, listProviders } from "../providers/registry.js";
import { hydrateCredentials } from "../auth/credentials.js";
import { printKeyValue, printScreen } from "../ui/text.js";
import {
  getProviderDefinition,
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
} from "../providers/catalog.js";

export async function runDoctor(): Promise<void> {
  const config = await loadConfig();
  const env = process.env;
  await hydrateCredentials(env);

  printScreen("reqraft doctor", "État de la configuration et des providers");
  console.log("Configuration");
  printKeyValue("Fichier", configPath());
  printKeyValue("Provider", config.defaultProvider);
  printKeyValue("Modèle", config.defaultModel);
  printKeyValue("Profil", config.defaultProfile);
  printKeyValue("Timeout", `${String(config.timeoutMs)} ms`);
  printKeyValue(
    "Sortie max.",
    config.maxOutputTokens === undefined
      ? "adaptative"
      : `${String(config.maxOutputTokens)} tokens`,
  );
  console.log("");

  console.log("Clés API");
  for (const definition of listCredentialProviders()) {
    const key = getProviderEnvName(definition.id);
    const present = env[key] ? "configuré" : "non configuré";
    console.log(`  ${definition.label.padEnd(10)} : ${present}`);
  }
  console.log("");

  console.log("Providers");
  for (const id of listProviders()) {
    try {
      const provider = createProvider(id as "mock", env, config);
      const health = await provider.validateConfiguration();
      const missing = health.missingConfiguration?.join(", ");
      const missingLabel =
        missing ?? (isCredentialProvider(id) ? getProviderEnvName(id) : "configuration");
      const status = health.ok ? "OK" : `manque ${missingLabel}`;
      console.log(`  ${getProviderDefinition(id as "mock").label.padEnd(20)} : ${status}`);
    } catch {
      console.log(`  ${id.padEnd(20)} : erreur`);
    }
  }
}
