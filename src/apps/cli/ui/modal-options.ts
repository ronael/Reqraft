import type { RepromptLevel } from "@/core/types.js";
import { REPROMPT_LEVELS } from "@/core/levels.js";
import { CAPABILITIES } from "@/capabilities/registry.js";
import {
  getPresetModels,
  getFallbackModelForProvider as getPresetFallbackModelForProvider,
} from "@/models/presets.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { getProfileCatalog } from "@/profiles/catalog.js";
import { listProviderDefinitions } from "@/providers/catalog.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { profileDescription } from "@/apps/cli/presentation/catalog-labels.js";

const DEFAULT_TRANSLATOR = createTranslator("fr");

export interface SelectOption<T extends string> {
  label: string;
  value: T;
  /**
   * `action` rows do something instead of selecting a value, so they carry no
   * "current" marker — a circle beside them would read as a choice that could
   * be the active one.
   */
  kind?: "value" | "action";
  /**
   * Group title shown above the first option carrying it. Purely presentational:
   * headers are derived at render time and never enter the option array, so the
   * arrow-key index space stays exactly the list of selectable rows.
   */
  section?: string;
  /** Short trailing note, e.g. the origin of a profile. */
  hint?: string;
}

export type ModalCommandAction =
  "generate" | "profile" | "level" | "provider" | "model" | "result" | "diff" | "explain" | "copy";

export const LEVEL_OPTIONS: SelectOption<RepromptLevel>[] = [
  ...REPROMPT_LEVELS.map((level) => ({ label: level, value: level })),
];

export const HELP_OPTIONS: SelectOption<string>[] = [
  { label: "Entrée — générer", value: "generate" },
  { label: "Ctrl+P — profil", value: "profile" },
  { label: "Ctrl+L — niveau", value: "level" },
  { label: "Ctrl+O — modèle", value: "model" },
  { label: "Ctrl+D — diff", value: "diff" },
  { label: "Ctrl+R — reset", value: "reset" },
];

/**
 * Profiles offered by the picker, grouped by origin.
 *
 * The catalogue is read from memory — `loadProfileCatalog()` filled it at
 * start-up and after every mutation — so this stays synchronous and the TUI
 * never touches the disk while rendering.
 */
/**
 * Sentinel for the "create a profile" row.
 *
 * Deliberately unrepresentable as a profile id — the id charset is lowercase
 * letters, digits and dashes — so a stored profile can never collide with it.
 */
export const NEW_PROFILE_OPTION = "::new-profile";

export function getProfileOptions(t: Translator = DEFAULT_TRANSLATOR): SelectOption<string>[] {
  const catalog = getProfileCatalog();
  const describe = (profile: { id: string; name: string; description: string }): string =>
    `${profile.name} — ${profileDescription(profile.id, profile.description, t)}`;

  return [
    { label: t("profile.autoDetection"), value: AUTO_PROFILE_ID },
    ...catalog.builtin.map((profile) => ({
      label: describe(profile),
      value: profile.id,
      section: t("list.profiles.builtin"),
    })),
    ...catalog.project.map((profile) => ({
      label: describe(profile),
      value: profile.id,
      section: t("list.profiles.project"),
    })),
    ...catalog.local.map((profile) => ({
      label: describe(profile),
      value: profile.id,
      section: t("list.profiles.local"),
      hint: t("profile.origin.local"),
    })),
    // Last, after the choices: the list reads as what you can pick, then what
    // you can do. Creating was previously reachable only through a chord
    // nothing advertised, which made the feature invisible in practice.
    {
      label: t("tui.picker.newProfile"),
      value: NEW_PROFILE_OPTION,
      kind: "action" as const,
      section: t("list.profiles.local"),
    },
  ];
}

/** Ignore la casse et les accents : « rédaction » se trouve en tapant « redaction ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Les options d'un sélecteur qui correspondent à une recherche.
 *
 * Les lignes d'action sont toujours gardées : quand rien ne correspond, « créer
 * un profil » est précisément ce qu'on veut faire, et le retirer de la liste
 * fermerait la seule issue.
 *
 * Même règle de repli que le sélecteur desktop (`renderer/shared/profiles.ts`) :
 * un catalogue se cherche de la même façon sur les deux surfaces, sinon il faut
 * apprendre deux fois la même chose.
 */
export function filterSelectOptions<T extends string>(
  options: readonly SelectOption<T>[],
  query: string,
): SelectOption<T>[] {
  const needle = fold(query.trim());
  if (needle === "") return [...options];
  return options.filter(
    (option) =>
      option.kind === "action" ||
      [option.label, option.value, option.hint ?? ""].some((field) => fold(field).includes(needle)),
  );
}

export function getProviderOptions(): SelectOption<string>[] {
  return listProviderDefinitions().map((provider) => ({
    label: `${provider.id} — ${provider.label}`,
    value: provider.id,
  }));
}

export function getModelOptions(provider: string): SelectOption<string>[] {
  return getPresetModels()
    .filter((model) => model.provider === provider)
    .map((model) => ({ label: `${model.id} — ${model.name}`, value: model.id }));
}

export function getFallbackModelForProvider(provider: string): string {
  return getPresetFallbackModelForProvider(provider) ?? "";
}

/** Les quatre sélecteurs qui présentent une liste de valeurs. */
export type PickerId = "profile" | "level" | "provider" | "model";

/**
 * Les options d'un sélecteur, en un seul endroit.
 *
 * L'écran les construisait pour l'affichage et l'application les reconstruisait
 * pour la sélection : deux tableaux devant rester identiques, sans quoi
 * l'index d'une flèche ne désigne pas la même ligne des deux côtés. Depuis que
 * la recherche filtre la liste, l'écart ne serait plus théorique.
 */
export function getPickerOptions(
  picker: PickerId,
  provider: string,
  t: Translator = DEFAULT_TRANSLATOR,
): SelectOption<string>[] {
  switch (picker) {
    case "profile":
      return getProfileOptions(t);
    case "level":
      return LEVEL_OPTIONS;
    case "provider":
      return getProviderOptions();
    case "model":
      return getModelOptions(provider);
  }
}

/**
 * Action de palette associée à chaque capacité du registre exposée dans la
 * TUI. Les capacités sans entrée ici (`interrupt`, les capacités CLI ou
 * desktop) ne passent pas par la palette.
 */
export const COMMAND_ACTION_BY_CAPABILITY: Readonly<Record<string, ModalCommandAction>> = {
  reformulate: "generate",
  "select-profile": "profile",
  "select-level": "level",
  "select-provider": "provider",
  "select-model": "model",
  "show-result": "result",
  "show-diff": "diff",
  "show-explain": "explain",
  "copy-result": "copy",
};

/**
 * Options de la palette, dérivées du registre de capacités : libellés, ordre
 * et condition `requiresResult` viennent de `CAPABILITIES`.
 */
export function getCommandOptions(hasResult: boolean): SelectOption<ModalCommandAction>[] {
  return CAPABILITIES.flatMap((capability) => {
    const action = COMMAND_ACTION_BY_CAPABILITY[capability.id];
    if (action === undefined) return [];
    if (capability.requiresResult === true && !hasResult) return [];
    return [{ label: capability.label, value: action }];
  });
}
