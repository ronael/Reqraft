import process from "node:process";
import { loadConfig, configPath } from "../config/loader.js";
import { createProvider, listProviders } from "../providers/registry.js";

export async function runDoctor(): Promise<void> {
  const config = await loadConfig();
  const env = process.env;

  console.log("Configuration");
  console.log(`  Fichier : ${configPath()}`);
  console.log(`  Provider par défaut : ${config.defaultProvider}`);
  console.log(`  Modèle par défaut : ${config.defaultModel}`);
  console.log(`  Profil par défaut : ${config.defaultProfile}`);
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
      console.log(`  ${id.padEnd(20)} : ${health.ok ? "OK" : `manque ${health.missingConfiguration?.join(", ") ?? "configuration"}`}`);
    } catch {
      console.log(`  ${id.padEnd(20)} : erreur`);
    }
  }
}
