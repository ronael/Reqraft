import { readFile, writeFile } from "node:fs/promises";
import { runOpenTuiAppV2 } from "@/apps/cli/tui/app/OpenTuiApp.js";
import type { AgentDraftSession } from "@/apps/cli/tui/app/use-agent-draft.js";
import { loadConfig } from "@/config/loader.js";
import { resolveUiLocale, systemLocaleCandidates } from "@/i18n/locale.js";
import { createTranslator } from "@/i18n/translate.js";
import { loadProfileCatalog } from "@/profiles/catalog.js";
import { reportProfileCatalogProblems } from "@/apps/cli/commands/profiles.js";
import { readAgentDraftArguments } from "./agent-draft-arguments.js";

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

// `rp edit` opens the interface on a terminal agent's draft. The file is
// written only when the user sends a result back; quitting leaves it as the
// agent wrote it.
const draftArguments = readAgentDraftArguments(process.argv.slice(2));
let agentDraft: AgentDraftSession | undefined;
if (draftArguments !== null) {
  const { file, ...settings } = draftArguments;
  agentDraft = {
    ...settings,
    draft: await readFile(file, "utf8"),
    use: (text) => writeFile(file, text, "utf8"),
  };
}

await runOpenTuiAppV2(t, undefined, agentDraft);
