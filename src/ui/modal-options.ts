import type { RepromptLevel } from "../core/types.js";
import { REPROMPT_LEVELS } from "../core/levels.js";
import {
  getPresetModels,
  getFallbackModelForProvider as getPresetFallbackModelForProvider,
} from "../models/presets.js";
import { AUTO_PROFILE_ID } from "../profiles/profile-ids.js";
import { listProfiles } from "../profiles/registry.js";
import { listProviderDefinitions } from "../providers/catalog.js";
import { createTranslator, type Translator } from "../i18n/translate.js";
import { profileDescription } from "../presentation/catalog-labels.js";

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

export function getCommandOptions(hasResult: boolean): SelectOption<ModalCommandAction>[] {
  return [
    { label: "Générer ou régénérer", value: "generate" },
    { label: "Changer de profil", value: "profile" },
    { label: "Changer de niveau", value: "level" },
    { label: "Changer de provider", value: "provider" },
    { label: "Changer de modèle", value: "model" },
    ...(hasResult
      ? [
          { label: "Afficher le résultat", value: "result" as const },
          { label: "Afficher le diff", value: "diff" as const },
          { label: "Afficher l'explication", value: "explain" as const },
          { label: "Copier le résultat", value: "copy" as const },
        ]
      : []),
  ];
}
