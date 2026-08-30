import { getPresetModels } from "@/models/presets.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { getProfileCatalog } from "@/profiles/catalog.js";
import type { PromptProfile } from "@/profiles/types.js";
import {
  getProviderDefinition,
  isBuiltinProvider,
  listProviderDefinitions,
} from "@/providers/catalog.js";
import { printScreen } from "@/shared/terminal/text.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { modelDescription, profileDescription } from "@/apps/cli/presentation/catalog-labels.js";

interface ListOutput {
  log(message: string): void;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");
const ID_COLUMN = 20;

function logProfile(profile: PromptProfile, output: ListOutput, t: Translator): void {
  output.log(
    `  ${profile.id.padEnd(ID_COLUMN)} ${profile.name} — ${profileDescription(profile.id, profile.description, t)}`,
  );
}

function logProblems(
  problems: readonly { path: string; detail: string }[],
  titleKey: "list.profiles.shadowed" | "list.profiles.invalid",
  output: ListOutput,
  t: Translator,
): void {
  if (problems.length === 0) return;
  output.log(`\n  ${t(titleKey)}`);
  for (const problem of problems) {
    output.log(`  ${problem.path} — ${problem.detail}`);
  }
}

/**
 * Lists what `--profile` accepts: `auto`, the built-in profiles, then the local
 * ones held by the shared catalogue. Local files the catalogue had to skip are
 * named too — an unusable profile is reported, never silently absent.
 */
export function runProfilesList(
  output: ListOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): void {
  const catalog = getProfileCatalog();
  printScreen(t("list.profiles.title"), t("list.profiles.subtitle"), output);

  output.log(`\n  ${t("list.profiles.builtin")}`);
  output.log(`  ${AUTO_PROFILE_ID.padEnd(ID_COLUMN)} ${t("list.profiles.auto")}`);
  for (const profile of catalog.builtin) {
    logProfile(profile, output, t);
  }

  if (catalog.project.length > 0) {
    output.log(`\n  ${t("list.profiles.project")}`);
    for (const profile of catalog.project) {
      logProfile(profile, output, t);
    }
  }

  output.log(`\n  ${t("list.profiles.local")}`);
  if (catalog.local.length === 0) {
    output.log(t("list.profiles.localNone"));
  }
  for (const profile of catalog.local) {
    logProfile(profile, output, t);
  }

  // Masqué et illisible sont deux choses différentes : un profil recouvert par
  // le projet fonctionne, il n'est simplement pas celui qui s'applique ici. Les
  // ranger ensemble apprendrait à ignorer les deux.
  logProblems(
    catalog.problems.filter((problem) => problem.kind === "shadowed"),
    "list.profiles.shadowed",
    output,
    t,
  );
  logProblems(
    catalog.problems.filter((problem) => problem.kind !== "shadowed"),
    "list.profiles.invalid",
    output,
    t,
  );
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
