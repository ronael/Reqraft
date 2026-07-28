import process from "node:process";
import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { version } from "./version.js";
import { runReprompt } from "./commands/reprompt.js";
import { listProviders } from "./providers/registry.js";
import { getPresetModels } from "./models/presets.js";

interface CliOptions {
  profile?: string;
  level?: string;
  provider?: string;
  model?: string;
  copy?: boolean;
  clipboard?: boolean;
  file?: string;
  json?: boolean;
  diff?: boolean;
  explain?: boolean;
  stream?: boolean;
  timeout?: string;
  verbose?: boolean;
}

const program = new Command();

program
  .name("rp")
  .alias("reprompt")
  .description("Transforme une demande brute en un prompt clair et exploitable.")
  .version(version, "-v, --version", "Affiche la version")
  .argument("[text]", "Texte à reformuler")
  .option("-p, --profile <profile>", "Profil de reformulation")
  .option("-l, --level <level>", "Niveau de transformation (minimal, standard, complete)")
  .option("--provider <provider>", "Provider LLM")
  .option("-m, --model <model>", "Modèle LLM")
  .option("-c, --copy", "Copier le résultat dans le presse-papiers")
  .option("--clipboard", "Lire le texte depuis le presse-papiers")
  .option("-f, --file <path>", "Lire le texte depuis un fichier")
  .option("--json", "Sortie structurée en JSON")
  .option("--diff", "Afficher un diff entre l'original et le résultat")
  .option("--explain", "Afficher une explication des modifications")
  .option("--no-stream", "Désactiver le streaming")
  .option("--timeout <ms>", "Timeout en millisecondes")
  .option("--verbose", "Mode verbeux")
  .action(async (text: string | undefined, options: CliOptions) => {
    if (process.stdin.isTTY && !text && !options.clipboard && !options.file) {
      render(<App />);
      return;
    }
    await runReprompt({ text, ...options });
  });

program
  .command("profiles")
  .description("Liste les profils disponibles")
  .action(() => {
    console.log("Profiles:");
    console.log("  auto");
    for (const profile of [
      "clean",
      "code",
      "frontend",
      "web-design",
      "debug",
      "review",
      "writing",
    ]) {
      console.log(`  ${profile}`);
    }
  });

program
  .command("providers")
  .description("Liste les providers disponibles")
  .action(() => {
    for (const id of listProviders()) {
      console.log(id);
    }
  });

program
  .command("models")
  .description("Liste les modèles recommandés")
  .action(() => {
    for (const preset of getPresetModels()) {
      console.log(`${preset.provider}\t${preset.id}\t${preset.name}`);
    }
  });

program
  .command("config")
  .description("Gère la configuration")
  .argument("[action]", "get, set, path")
  .argument("[key]", "Clé de configuration")
  .argument("[value]", "Valeur de configuration")
  .action((action?: string) => {
    console.log(`config ${action ?? ""} — implémenté dans les lots suivants`);
  });

program
  .command("doctor")
  .description("Vérifie l'installation et la configuration")
  .action(() => {
    console.log("doctor — implémenté dans les lots suivants");
  });

program
  .command("version")
  .description("Affiche la version")
  .action(() => {
    console.log(version);
  });

program.parse();
