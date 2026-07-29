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
  options: AliasCommandOptions = {},
): Promise<number> {
  const output = options.output ?? console;
  const confirm = options.confirm ?? ask;
  const shell = options.shell ?? detectShell();
  if (shell === "unknown") {
    output.error("Shell non reconnu. Shells supportés : Bash, Zsh, Fish, PowerShell.");
    return EXIT_CODES.INVALID_CONFIGURATION;
  }

  const configPath = options.configPath ?? getShellConfigPath(shell);
  if (!configPath) {
    output.error("Impossible de déterminer le fichier de configuration du shell.");
    return EXIT_CODES.INVALID_CONFIGURATION;
  }

  switch (action) {
    case "set":
      if (!name) {
        output.error("Usage : rp alias set <nom>");
        return EXIT_CODES.INVALID_INPUT;
      }
      return await runSet(configPath, shell, name, options.dryRun ?? false, output, confirm);
    case "remove":
      if (!name) {
        output.error("Usage : rp alias remove <nom>");
        return EXIT_CODES.INVALID_INPUT;
      }
      return await runRemove(configPath, shell, name, options.dryRun ?? false, output, confirm);
    case "list":
      return await runList(configPath, shell, output);
    default:
      output.error("Usage : rp alias set|remove|list [nom]");
      return EXIT_CODES.INVALID_INPUT;
  }
}

interface AliasOutput {
  log(message: string): void;
  error(message: string): void;
}

interface AliasCommandOptions {
  dryRun?: boolean;
  shell?: ShellType;
  configPath?: string;
  output?: AliasOutput;
  confirm?: (question: string) => Promise<string>;
}

async function runSet(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  name: string,
  dryRun: boolean,
  output: AliasOutput,
  confirm: (question: string) => Promise<string>,
): Promise<number> {
  try {
    const operation = await setAlias(configPath, shell, name, dryRun);
    output.log(`Alias à ajouter : ${name}`);
    output.log(`Shell : ${operation.shell}`);
    output.log(`Fichier : ${operation.path}`);
    if (dryRun) {
      output.log("\n[--dry-run] Aucune modification appliquée.");
      output.log("Contenu prévu :");
      output.log(operation.content);
      return EXIT_CODES.SUCCESS;
    }

    const answer = await confirm("Appliquer la modification ? (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      output.log("Modification annulée.");
      return EXIT_CODES.SUCCESS;
    }

    await setAlias(configPath, shell, name, false);
    output.log(`Alias '${name}' ajouté. Rechargez votre shell ou exécutez : source ${configPath}`);
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    output.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_CODES.GENERAL_ERROR;
  }
}

async function runRemove(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  name: string,
  dryRun: boolean,
  output: AliasOutput,
  confirm: (question: string) => Promise<string>,
): Promise<number> {
  try {
    const operation = await removeAlias(configPath, shell, name, dryRun);
    output.log(`Alias à supprimer : ${name}`);
    output.log(`Shell : ${operation.shell}`);
    output.log(`Fichier : ${operation.path}`);
    if (dryRun) {
      output.log("\n[--dry-run] Aucune modification appliquée.");
      output.log("Contenu prévu :");
      output.log(operation.content);
      return EXIT_CODES.SUCCESS;
    }

    const answer = await confirm("Confirmer la suppression ? (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      output.log("Suppression annulée.");
      return EXIT_CODES.SUCCESS;
    }

    await removeAlias(configPath, shell, name, false);
    output.log(
      `Alias '${name}' supprimé. Rechargez votre shell ou exécutez : source ${configPath}`,
    );
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    output.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_CODES.GENERAL_ERROR;
  }
}

async function runList(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  output: AliasOutput,
): Promise<number> {
  try {
    const aliases = await listAliases(configPath, shell);
    if (aliases.length === 0) {
      output.log("Aucun alias rp configuré.");
      return EXIT_CODES.SUCCESS;
    }
    for (const alias of aliases) {
      output.log(alias);
    }
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    output.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_CODES.GENERAL_ERROR;
  }
}
