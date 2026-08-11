import { runOpenTuiApp } from "./app.js";
import { loadConfig } from "../config/loader.js";
import { resolveUiLocale, systemLocaleCandidates } from "../i18n/locale.js";
import { createTranslator } from "../i18n/translate.js";

let configuredLocale: string | undefined;
try {
  configuredLocale = (await loadConfig()).uiLocale;
} catch {
  // The interactive bootstrap will present the configuration error.
}
const locale = resolveUiLocale({
  config: configuredLocale,
  env: process.env.REQRAFT_UI_LOCALE,
  systemLocales: systemLocaleCandidates(),
});

await runOpenTuiApp(createTranslator(locale));
