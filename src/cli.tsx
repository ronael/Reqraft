import process from "node:process";
import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { version } from "./version.js";
import { runReprompt } from "./commands/reprompt.js";
import { runConfig } from "./commands/config.js";
import { runDoctor } from "./commands/doctor.js";
import { runFirstRunSetup } from "./commands/first-run.js";
import { runAlias } from "./commands/aliases.js";
import { runModelsList, runProfilesList, runProvidersList } from "./commands/list.js";
import { runAuth } from "./commands/auth.js";
import { listCredentialProviders } from "./providers/catalog.js";
import type { FidelityMode } from "./core/types.js";

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
  stats?: boolean;
  fidelity?: FidelityMode;
  stream?: boolean;
  timeout?: string;
  maxOutputTokens?: string;
  failOnQuality?: boolean;
  verbose?: boolean;
}

const program = new Command();
const AUTH_PROVIDER_HINT = listCredentialProviders()
  .map((provider) => provider.id)
  .join(", ");

function applyExitCode(exitCode: number): void {
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

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
  .option("--stats", "Afficher les statistiques de génération")
  .option("--fidelity <mode>", "Politique de fidélité (permissive, balanced, strict)")
  .option("--no-stream", "Désactiver le streaming")
  .option("--timeout <ms>", "Timeout en millisecondes")
  .option("--max-output-tokens <tokens>", "Plafond de tokens de sortie pour cette génération")
  .option("--fail-on-quality", "Retourner un code non nul si le résultat doit être vérifié")
  .option("--verbose", "Mode verbeux")
  .option("--force", "Forcer l'envoi malgré un secret détecté")
  .option("--redact-secrets", "Masquer automatiquement les secrets détectés")
  .action(async (text: string | undefined, options: CliOptions) => {
    if (process.stdin.isTTY && !text && !options.clipboard && !options.file) {
      render(<App />);
      return;
    }
    applyExitCode(await runReprompt({ text, ...options }));
  });

program
  .command("auth")
  .description("Gère les clés API dans le stockage sécurisé")
  .argument("<action>", "login, logout, status")
  .argument("[provider]", AUTH_PROVIDER_HINT)
  .action(async (action: string, provider?: string) => {
    applyExitCode(await runAuth(action, provider));
  });

program
  .command("profiles")
  .description("Liste les profils disponibles")
  .action(() => {
    runProfilesList();
  });

program
  .command("providers")
  .description("Liste les providers disponibles")
  .action(() => {
    runProvidersList();
  });

program
  .command("models")
  .description("Liste les modèles recommandés")
  .action(() => {
    runModelsList();
  });

program
  .command("init")
  .description("Lance l'assistant de configuration initiale")
  .option("--reset", "Recommencer avec les valeurs par défaut")
  .action(async (options: { reset?: boolean }) => {
    await runFirstRunSetup({ reset: options.reset });
  });

program
  .command("config")
  .description("Gère la configuration")
  .argument("[action]", "get, set, path, setup")
  .argument("[key]", "Clé de configuration")
  .argument("[value]", "Valeur de configuration")
  .option("--reset", "Avec setup, recommencer avec les valeurs par défaut")
  .action(async (action?: string, key?: string, value?: string, options?: { reset?: boolean }) => {
    if (action === "setup") {
      await runFirstRunSetup({ reset: options?.reset });
      return;
    }
    applyExitCode(await runConfig(action, key, value));
  });

program
  .command("doctor")
  .description("Vérifie l'installation et la configuration")
  .action(async () => {
    await runDoctor();
  });

program
  .command("alias")
  .description("Gère les alias shell")
  .argument("<action>", "set, remove, list")
  .argument("[name]", "Nom de l'alias")
  .option("--dry-run", "Afficher la modification sans l'appliquer")
  .action(async (action: string, name?: string, options?: { dryRun?: boolean }) => {
    applyExitCode(await runAlias(action, name, options ?? {}));
  });

program
  .command("version")
  .description("Affiche la version")
  .action(() => {
    console.log(version);
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
