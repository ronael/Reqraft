import process from "node:process";
import { Command, Help } from "commander";
import { version } from "@/version.js";
import { runReprompt } from "./commands/reprompt.js";
import { runConfig } from "./commands/config.js";
import { runDoctor } from "./commands/doctor.js";
import { runFirstRunSetup } from "./commands/first-run.js";
import { runAlias } from "./commands/aliases.js";
import { runModelsList, runProfilesList, runProvidersList } from "./commands/list.js";
import {
  runProfilesAdd,
  runProfilesDuplicate,
  runProfilesEdit,
  runProfilesExport,
  runProfilesRemove,
} from "./commands/profiles.js";
import { runAuth } from "./commands/auth.js";
import { listCredentialProviders } from "@/providers/catalog.js";
import type { FidelityMode } from "@/core/types.js";
import { runOpenTuiAppLauncher } from "./opentui/launcher.js";
import type { Translator } from "@/i18n/translate.js";

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
  uiLocale?: string;
  outputLanguage?: string;
}

function applyExitCode(exitCode: number): void {
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

function configureLocalizedHelp(command: Command, t: Translator): void {
  command.helpOption("-h, --help", t("cli.help"));
  command.createHelp = (): Help => {
    const help = new Help();
    const formatHelp = help.formatHelp.bind(help);
    help.formatHelp = (target, activeHelp): string =>
      formatHelp(target, activeHelp)
        .replace(/^Usage:/m, `${t("cli.help.usage")}:`)
        .replace(/^Arguments:/m, `${t("cli.help.arguments")}:`)
        .replace(/^Options:/m, `${t("cli.help.options")}:`)
        .replace(/^Commands:/m, `${t("cli.help.commands")}:`);
    return help;
  };
  for (const child of command.commands) configureLocalizedHelp(child, t);
}

/**
 * Builds the Commander program without parsing anything, so tests can
 * introspect the real option declarations (see `capabilities/cli.ts`).
 * `uiLocale` is the already-resolved locale handed to the TUI launcher.
 */
export function createCliProgram(t: Translator, uiLocale: "en" | "fr"): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: () => undefined });
  // An option written after a sub-command belongs to that sub-command. Without
  // this, `rp profiles add --file x.json` would hand `--file` to the root
  // command, which declares `-f, --file` for its own input, and the import
  // would silently receive nothing. Root options keep working before and after
  // the `[text]` argument.
  program.enablePositionalOptions();
  const authProviderHint = listCredentialProviders()
    .map((provider) => provider.id)
    .join(", ");

  program
    .name("rp")
    .alias("reprompt")
    .description(t("cli.description"))
    .version(version, "-v, --version", t("common.version"))
    .helpOption("-h, --help", t("cli.help"))
    .argument("[text]", t("cli.argument.text"))
    .option("-p, --profile <profile>", t("cli.option.profile"))
    .option("-l, --level <level>", t("cli.option.level"))
    .option("--provider <provider>", t("cli.option.provider"))
    .option("-m, --model <model>", t("cli.option.model"))
    .option("-c, --copy", t("cli.option.copy"))
    .option("--clipboard", t("cli.option.clipboard"))
    .option("-f, --file <path>", t("cli.option.file"))
    .option("--json", t("cli.option.json"))
    .option("--diff", t("cli.option.diff"))
    .option("--explain", t("cli.option.explain"))
    .option("--stats", t("cli.option.stats"))
    .option("--fidelity <mode>", t("cli.option.fidelity"))
    .option("--no-stream", t("cli.option.noStream"))
    .option("--timeout <ms>", t("cli.option.timeout"))
    .option("--max-output-tokens <tokens>", t("cli.option.maxOutputTokens"))
    .option("--fail-on-quality", t("cli.option.failOnQuality"))
    .option("--verbose", t("cli.option.verbose"))
    .option("--force", t("cli.option.force"))
    .option("--redact-secrets", t("cli.option.redactSecrets"))
    .option("--ui-locale <locale>", t("cli.option.uiLocale"))
    .option("--output-language <language>", t("cli.option.outputLanguage"))
    .action(async (text: string | undefined, options: CliOptions) => {
      if (process.stdin.isTTY && !text && !options.clipboard && !options.file) {
        applyExitCode(runOpenTuiAppLauncher(uiLocale));
        return;
      }
      applyExitCode(await runReprompt({ text, ...options }, console, t));
    });

  program
    .command("auth")
    .description(t("cli.auth.description"))
    .argument("<action>", t("cli.auth.action"))
    .argument("[provider]", authProviderHint)
    .action(async (action: string, provider?: string) => {
      applyExitCode(await runAuth(action, provider, {}, t));
    });

  const profiles = program
    .command("profiles")
    .description(t("cli.profiles.description"))
    .action(() => {
      runProfilesList(console, t);
    });

  profiles
    .command("add")
    .description(t("cli.profiles.add.description"))
    .option("--file <path>", t("cli.profiles.add.file"))
    .action(async (options: { file?: string }) => {
      applyExitCode(await runProfilesAdd({ file: options.file }, t));
    });

  profiles
    .command("edit")
    .description(t("cli.profiles.edit.description"))
    .argument("<id>", t("cli.profiles.edit.id"))
    .action(async (id: string) => {
      applyExitCode(await runProfilesEdit(id, {}, t));
    });

  profiles
    .command("duplicate")
    .description(t("cli.profiles.duplicate.description"))
    .argument("<source>", t("cli.profiles.duplicate.source"))
    .argument("<target>", t("cli.profiles.duplicate.target"))
    .option("--name <name>", t("cli.profiles.duplicate.name"))
    .action(async (source: string, target: string, options: { name?: string }) => {
      applyExitCode(await runProfilesDuplicate(source, target, { name: options.name }, t));
    });

  profiles
    .command("export")
    .description(t("cli.profiles.export.description"))
    .argument("<id>", t("cli.profiles.export.id"))
    .option("--output <path>", t("cli.profiles.export.output"))
    .option("--as <id>", t("cli.profiles.export.as"))
    .action(async (id: string, options: { output?: string; as?: string }) => {
      applyExitCode(await runProfilesExport(id, { file: options.output, exportId: options.as }, t));
    });

  profiles
    .command("remove")
    .description(t("cli.profiles.remove.description"))
    .argument("<id>", t("cli.profiles.remove.id"))
    .action(async (id: string) => {
      applyExitCode(await runProfilesRemove(id, {}, t));
    });

  program
    .command("providers")
    .description(t("cli.providers.description"))
    .action(() => {
      runProvidersList(console, t);
    });

  program
    .command("models")
    .description(t("cli.models.description"))
    .action(() => {
      runModelsList(console, t);
    });

  program
    .command("init")
    .description(t("cli.init.description"))
    .option("--reset", t("cli.reset"))
    .action(async (options: { reset?: boolean }) => {
      await runFirstRunSetup({ reset: options.reset }, t);
    });

  program
    .command("config")
    .description(t("cli.config.description"))
    .argument("[action]", t("cli.config.action"))
    .argument("[key]", t("cli.config.key"))
    .argument("[value]", t("cli.config.value"))
    .option("--reset", t("cli.reset"))
    .action(
      async (action?: string, key?: string, value?: string, options?: { reset?: boolean }) => {
        if (action === "setup") {
          await runFirstRunSetup({ reset: options?.reset }, t);
          return;
        }
        applyExitCode(await runConfig(action, key, value, console, t));
      },
    );

  program
    .command("doctor")
    .description(t("cli.doctor.description"))
    .action(async () => {
      await runDoctor({}, t);
    });

  program
    .command("alias")
    .description(t("cli.alias.description"))
    .argument("<action>", t("cli.alias.action"))
    .argument("[name]", t("cli.alias.name"))
    .option("--dry-run", t("cli.alias.dryRun"))
    .action(async (action: string, name?: string, options?: { dryRun?: boolean }) => {
      applyExitCode(await runAlias(action, name, options ?? {}, t));
    });

  program
    .command("version")
    .description(t("common.version"))
    .action(() => {
      console.log(version);
    });

  configureLocalizedHelp(program, t);
  return program;
}
