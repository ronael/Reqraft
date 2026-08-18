import process from "node:process";
import { CommanderError } from "commander";
import { createCliProgram } from "./cli-program.js";
import { loadConfig } from "./config/loader.js";
import { findUiLocalePreference, resolveUiLocale, systemLocaleCandidates } from "./i18n/locale.js";
import { createTranslator } from "./i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";

const cliLocalePreference = findUiLocalePreference(process.argv);
let configuredLocale: string | undefined;
try {
  configuredLocale = (await loadConfig()).uiLocale;
} catch {
  // The command surface reports the configuration error after locale bootstrap.
}
let localeBootstrapError: unknown;
let uiLocale: "en" | "fr" = "en";
try {
  uiLocale = resolveUiLocale({
    cli: cliLocalePreference,
    config: configuredLocale,
    env: process.env.REQRAFT_UI_LOCALE,
    systemLocales: systemLocaleCandidates(),
  });
} catch (error) {
  localeBootstrapError = error;
}
const t = createTranslator(uiLocale);

const program = createCliProgram(t, uiLocale);

function reportTopLevelError(message: string, exitCode: number): void {
  console.error(`${t("common.error")} : ${message}`);
  process.exitCode = exitCode;
}

async function parseProgram(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode !== 0) reportTopLevelError(t("cli.invalidCommand"), error.exitCode);
      else process.exitCode = error.exitCode;
      return;
    }
    reportTopLevelError(formatUiError(error, "provider", t), 1);
  }
}

if (localeBootstrapError) {
  reportTopLevelError(t("cli.invalidLocale"), 2);
} else {
  await parseProgram();
}
