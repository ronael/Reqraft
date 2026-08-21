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
