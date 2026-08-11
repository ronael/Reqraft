import process from "node:process";
import readline from "node:readline";
import { detectShell, getShellConfigPath, type ShellType } from "../aliases/detector.js";
import { listAliases, removeAlias, setAlias } from "../aliases/manager.js";
import { EXIT_CODES } from "../utils/exit-codes.js";
import { createTranslator, type Translator } from "../i18n/translate.js";
import { formatUiError } from "../ui/errors.js";

const DEFAULT_TRANSLATOR = createTranslator("fr");

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
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = options.output ?? console;
  const confirm = options.confirm ?? ask;
  const shell = options.shell ?? detectShell();
  if (shell === "unknown") {
    output.error(t("alias.shellUnknown"));
    return EXIT_CODES.INVALID_CONFIGURATION;
  }

  const configPath = options.configPath ?? getShellConfigPath(shell);
  if (!configPath) {
    output.error(t("alias.configUnknown"));
    return EXIT_CODES.INVALID_CONFIGURATION;
  }

  switch (action) {
    case "set":
      if (!name) {
        output.error(t("alias.setUsage"));
        return EXIT_CODES.INVALID_INPUT;
      }
      return await runSet(configPath, shell, name, options.dryRun ?? false, output, confirm, t);
    case "remove":
      if (!name) {
        output.error(t("alias.removeUsage"));
        return EXIT_CODES.INVALID_INPUT;
      }
      return await runRemove(configPath, shell, name, options.dryRun ?? false, output, confirm, t);
    case "list":
      return await runList(configPath, shell, output, t);
    default:
      output.error(t("alias.usage"));
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

function reportAliasError(error: unknown, output: AliasOutput, t: Translator): void {
  output.error(`${t("common.error")} : ${formatUiError(error, "alias", t)}`);
}

async function runSet(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  name: string,
  dryRun: boolean,
  output: AliasOutput,
  confirm: (question: string) => Promise<string>,
  t: Translator,
): Promise<number> {
  try {
    const operation = await setAlias(configPath, shell, name, dryRun);
    output.log(t("alias.add", { name }));
    output.log(t("alias.shell", { shell: operation.shell }));
    output.log(t("alias.file", { path: operation.path }));
    if (dryRun) {
      output.log(t("alias.dryRun"));
      output.log(t("alias.plannedContent"));
      output.log(operation.content);
      return EXIT_CODES.SUCCESS;
    }

    const answer = await confirm(t("alias.confirmApply"));
    if (answer !== "y" && answer !== "yes") {
      output.log(t("alias.cancelled"));
      return EXIT_CODES.SUCCESS;
    }

    await setAlias(configPath, shell, name, false);
    output.log(t("alias.added", { name, path: configPath }));
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    reportAliasError(error, output, t);
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
  t: Translator,
): Promise<number> {
  try {
    const operation = await removeAlias(configPath, shell, name, dryRun);
    output.log(t("alias.remove", { name }));
    output.log(t("alias.shell", { shell: operation.shell }));
    output.log(t("alias.file", { path: operation.path }));
    if (dryRun) {
      output.log(t("alias.dryRun"));
      output.log(t("alias.plannedContent"));
      output.log(operation.content);
      return EXIT_CODES.SUCCESS;
    }

    const answer = await confirm(t("alias.confirmRemove"));
    if (answer !== "y" && answer !== "yes") {
      output.log(t("alias.removalCancelled"));
      return EXIT_CODES.SUCCESS;
    }

    await removeAlias(configPath, shell, name, false);
    output.log(t("alias.removed", { name, path: configPath }));
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    reportAliasError(error, output, t);
    return EXIT_CODES.GENERAL_ERROR;
  }
}

async function runList(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  output: AliasOutput,
  t: Translator,
): Promise<number> {
  try {
    const aliases = await listAliases(configPath, shell);
    if (aliases.length === 0) {
      output.log(t("alias.none"));
      return EXIT_CODES.SUCCESS;
    }
    for (const alias of aliases) {
      output.log(alias);
    }
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    reportAliasError(error, output, t);
    return EXIT_CODES.GENERAL_ERROR;
  }
}
