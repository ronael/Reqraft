import { runOpenTuiAppV2 } from "@/apps/cli/tui/app/OpenTuiApp.js";
import { loadConfig } from "@/config/loader.js";
import { resolveUiLocale, systemLocaleCandidates } from "@/i18n/locale.js";
import { createTranslator } from "@/i18n/translate.js";
import { loadProfileCatalog } from "@/profiles/catalog.js";
import { reportProfileCatalogProblems } from "@/apps/cli/commands/profiles.js";

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

const t = createTranslator(locale);

// The renderer never touches the disk: local profiles are read here, once,
// so `getProfileOptions()` stays synchronous inside the OpenTUI tree.
reportProfileCatalogProblems(await loadProfileCatalog(), console, t);

await runOpenTuiAppV2(t);
