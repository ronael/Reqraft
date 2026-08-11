import { getPresetModels } from "../models/presets.js";
import { AUTO_PROFILE_ID } from "../profiles/profile-ids.js";
import { listProfiles } from "../profiles/registry.js";
import {
  getProviderDefinition,
  isBuiltinProvider,
  listProviderDefinitions,
} from "../providers/catalog.js";
import { printScreen } from "../ui/text.js";
import { createTranslator, type Translator } from "../i18n/translate.js";
import { modelDescription, profileDescription } from "../presentation/catalog-labels.js";

interface ListOutput {
  log(message: string): void;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

export function runProfilesList(
  output: ListOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): void {
  printScreen(t("list.profiles.title"), t("list.profiles.subtitle"), output);
  output.log(`  ${AUTO_PROFILE_ID.padEnd(20)} ${t("list.profiles.auto")}`);
  for (const profile of listProfiles()) {
    output.log(
      `  ${profile.id.padEnd(20)} ${profile.name} — ${profileDescription(profile.id, profile.description, t)}`,
    );
  }
}

export function runProvidersList(
  output: ListOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): void {
  printScreen(t("list.providers.title"), t("list.providers.subtitle"), output);
  for (const definition of listProviderDefinitions()) {
    output.log(`  ${definition.id.padEnd(20)} ${definition.label}`);
  }
}

export function runModelsList(
  output: ListOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): void {
  printScreen(t("list.models.title"), t("list.models.subtitle"), output);
  let currentProvider = "";
  for (const preset of getPresetModels()) {
    if (preset.provider !== currentProvider) {
      currentProvider = preset.provider;
      const providerLabel = isBuiltinProvider(currentProvider)
        ? getProviderDefinition(currentProvider).label
        : currentProvider;
      output.log(`\n  ${currentProvider} — ${providerLabel}`);
    }
    output.log(
      `    ${preset.id.padEnd(30)} ${preset.name} — ${modelDescription(preset.id, preset.description, t)}`,
    );
  }
}
