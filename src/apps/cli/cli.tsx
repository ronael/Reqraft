import process from "node:process";
import { CommanderError } from "commander";
import { createCliProgram } from "./cli-program.js";
import { loadConfig } from "@/config/loader.js";
import { findUiLocalePreference, resolveUiLocale, systemLocaleCandidates } from "@/i18n/locale.js";
import { createTranslator } from "@/i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";
import { loadProfileCatalog } from "@/profiles/catalog.js";
import { reportProfileCatalogProblems } from "./commands/profiles.js";
import { notifyCliUpdate, shouldRunCliUpdateNotifier } from "./update-notifier.js";
import { version } from "@/version.js";

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

// Local profiles are read once, before any command parses input: `--profile`,
// `rp profiles` and the TUI selector all read the catalogue synchronously
// afterwards. A file that could not be loaded is named on stderr instead of
// disappearing from the list.
reportProfileCatalogProblems(await loadProfileCatalog(), console, t);

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
  if (
    shouldRunCliUpdateNotifier({
      argv: process.argv,
      env: process.env,
      stderrIsTTY: process.stderr.isTTY,
      exitCode: process.exitCode,
    })
  ) {
    await notifyCliUpdate({ currentVersion: version, t }).catch(() => undefined);
  }
}
