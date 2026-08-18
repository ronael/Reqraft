import type { RepromptLevel } from "@/core/types.js";
import { REPROMPT_LEVELS } from "@/core/levels.js";
import { CAPABILITIES } from "@/capabilities/registry.js";
import {
  getPresetModels,
  getFallbackModelForProvider as getPresetFallbackModelForProvider,
} from "@/models/presets.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { listProfiles } from "@/profiles/registry.js";
import { listProviderDefinitions } from "@/providers/catalog.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { profileDescription } from "@/presentation/catalog-labels.js";

const DEFAULT_TRANSLATOR = createTranslator("fr");

export interface SelectOption<T extends string> {
  label: string;
  value: T;
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

export function getProfileOptions(t: Translator = DEFAULT_TRANSLATOR): SelectOption<string>[] {
  return [
    { label: t("profile.autoDetection"), value: AUTO_PROFILE_ID },
    ...listProfiles().map((profile) => ({
      label: `${profile.name} — ${profileDescription(profile.id, profile.description, t)}`,
      value: profile.id,
    })),
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
