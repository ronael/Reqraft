import process from "node:process";
import { loadConfig, configPath } from "../config/loader.js";
import { createProvider, listProviders } from "../providers/registry.js";
import { hydrateCredentials } from "../auth/credentials.js";
import { printKeyValue, printScreen } from "../ui/text.js";

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
  const keys = [
    { name: "Anthropic", env: "ANTHROPIC_API_KEY" },
    { name: "OpenAI", env: "OPENAI_API_KEY" },
    { name: "DeepSeek", env: "DEEPSEEK_API_KEY" },
    { name: "Mistral", env: "MISTRAL_API_KEY" },
  ] as const;

  for (const { name, env: key } of keys) {
    const present = env[key] ? "configuré" : "non configuré";
    console.log(`  ${name.padEnd(10)} : ${present}`);
  }
  console.log("");

  console.log("Providers");
  for (const id of listProviders()) {
    try {
      const provider = createProvider(id as "mock", env, config);
      const health = await provider.validateConfiguration();
      console.log(
        `  ${id.padEnd(20)} : ${health.ok ? "OK" : `manque ${health.missingConfiguration?.join(", ") ?? "configuration"}`}`,
      );
    } catch {
      console.log(`  ${id.padEnd(20)} : erreur`);
    }
  }
}
