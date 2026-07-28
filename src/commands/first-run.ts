import process from "node:process";
import readline from "node:readline";
import type { Config } from "../config/schema.js";
import { saveConfig } from "../config/loader.js";

const PRESETS = [
  { label: "Recommandé — Claude Haiku 4.5", provider: "anthropic", model: "claude-haiku-4-5" },
  { label: "Économique — DeepSeek V4 Flash", provider: "deepseek", model: "deepseek-v4-flash" },
  { label: "OpenAI — GPT-5.4 mini", provider: "openai", model: "gpt-5.4-mini" },
  { label: "Européen — Mistral Small 4", provider: "mistral", model: "mistral-small-2603" },
  { label: "Configuration personnalisée", provider: "mock", model: "mock-model" },
];

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runFirstRunSetup(): Promise<void> {
  console.log("Premier démarrage de rp.");
  console.log("");
  console.log("Quel équilibre souhaitez-vous ?");
  console.log("");
  for (const [i, preset] of PRESETS.entries()) {
    console.log(`${String(i + 1)}. ${preset.label}`);
  }
  console.log("");

  const answer = await ask("Votre choix (1-5) : ");
  const index = Number(answer) - 1;
  const preset = PRESETS[index];

  if (!preset) {
    console.log("Choix invalide. Configuration par défaut conservée.");
    return;
  }

  const config: Config = {
    defaultProvider: preset.provider as Config["defaultProvider"],
    defaultModel: preset.model,
    defaultProfile: "auto",
    defaultLevel: "standard",
    copyAfterGeneration: false,
    stream: true,
    timeoutMs: 30000,
    showChanges: false,
    telemetry: false,
  };

  await saveConfig(config);
  console.log(`\nConfiguration enregistrée : ${preset.label}`);
  console.log(`Provider : ${config.defaultProvider}`);
  console.log(`Modèle : ${config.defaultModel}`);
}
