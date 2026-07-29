import { getPresetModels } from "../models/presets.js";
import { AUTO_PROFILE_ID } from "../profiles/profile-ids.js";
import { listProfiles } from "../profiles/registry.js";
import {
  getProviderDefinition,
  isBuiltinProvider,
  listProviderDefinitions,
} from "../providers/catalog.js";
import { printScreen } from "../ui/text.js";

interface ListOutput {
  log(message: string): void;
}

export function runProfilesList(output: ListOutput = console): void {
  printScreen("Profils", "Styles de reformulation disponibles", output);
  output.log(`  ${AUTO_PROFILE_ID.padEnd(20)} Détection automatique`);
  for (const profile of listProfiles()) {
    output.log(`  ${profile.id.padEnd(20)} ${profile.name}`);
  }
}

export function runProvidersList(output: ListOutput = console): void {
  printScreen("Providers", "Connexions IA disponibles", output);
  for (const definition of listProviderDefinitions()) {
    output.log(`  ${definition.id.padEnd(20)} ${definition.label}`);
  }
}

export function runModelsList(output: ListOutput = console): void {
  printScreen("Modèles", "Modèles recommandés par provider", output);
  let currentProvider = "";
  for (const preset of getPresetModels()) {
    if (preset.provider !== currentProvider) {
      currentProvider = preset.provider;
      const providerLabel = isBuiltinProvider(currentProvider)
        ? getProviderDefinition(currentProvider).label
        : currentProvider;
      output.log(`\n  ${currentProvider} — ${providerLabel}`);
    }
    output.log(`    ${preset.id.padEnd(30)} ${preset.name}`);
  }
}
