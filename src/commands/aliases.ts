import process from "node:process";
import readline from "node:readline";
import { detectShell, getShellConfigPath, type ShellType } from "../aliases/detector.js";
import { listAliases, removeAlias, setAlias } from "../aliases/manager.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function runAlias(
  action: string | undefined,
  name: string | undefined,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const shell = detectShell();
  if (shell === "unknown") {
    console.error("Shell non reconnu. Shells supportés : Bash, Zsh, Fish, PowerShell.");
    process.exit(EXIT_CODES.INVALID_CONFIGURATION);
  }

  const configPath = getShellConfigPath(shell);
  if (!configPath) {
    console.error("Impossible de déterminer le fichier de configuration du shell.");
    process.exit(EXIT_CODES.INVALID_CONFIGURATION);
  }

  switch (action) {
    case "set":
      if (!name) {
        console.error("Usage : rp alias set <nom>");
        process.exit(EXIT_CODES.INVALID_INPUT);
      }
      await runSet(configPath, shell, name, options.dryRun ?? false);
      break;
    case "remove":
      if (!name) {
        console.error("Usage : rp alias remove <nom>");
        process.exit(EXIT_CODES.INVALID_INPUT);
      }
      await runRemove(configPath, shell, name, options.dryRun ?? false);
      break;
    case "list":
      await runList(configPath, shell);
      break;
    default:
      console.error("Usage : rp alias set|remove|list [nom]");
      process.exit(EXIT_CODES.INVALID_INPUT);
  }
}

async function runSet(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  name: string,
  dryRun: boolean,
): Promise<void> {
  try {
    const operation = await setAlias(configPath, shell, name, dryRun);
    console.log(`Alias à ajouter : ${name}`);
    console.log(`Shell : ${operation.shell}`);
    console.log(`Fichier : ${operation.path}`);
    if (dryRun) {
      console.log("\n[--dry-run] Aucune modification appliquée.");
      console.log("Contenu prévu :");
      console.log(operation.content);
      return;
    }

    const answer = await ask("Appliquer la modification ? (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      console.log("Modification annulée.");
      return;
    }

    await setAlias(configPath, shell, name, false);
    console.log(`Alias '${name}' ajouté. Rechargez votre shell ou exécutez : source ${configPath}`);
  } catch (error) {
    console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}

async function runRemove(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  name: string,
  dryRun: boolean,
): Promise<void> {
  try {
    const operation = await removeAlias(configPath, shell, name, dryRun);
    console.log(`Alias à supprimer : ${name}`);
    console.log(`Shell : ${operation.shell}`);
    console.log(`Fichier : ${operation.path}`);
    if (dryRun) {
      console.log("\n[--dry-run] Aucune modification appliquée.");
      console.log("Contenu prévu :");
      console.log(operation.content);
      return;
    }

    const answer = await ask("Confirmer la suppression ? (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      console.log("Suppression annulée.");
      return;
    }

    await removeAlias(configPath, shell, name, false);
    console.log(`Alias '${name}' supprimé. Rechargez votre shell ou exécutez : source ${configPath}`);
  } catch (error) {
    console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}

async function runList(configPath: string, shell: Exclude<ShellType, "unknown">): Promise<void> {
  try {
    const aliases = await listAliases(configPath, shell);
    if (aliases.length === 0) {
      console.log("Aucun alias rp configuré.");
      return;
    }
    for (const alias of aliases) {
      console.log(alias);
    }
  } catch (error) {
    console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}
