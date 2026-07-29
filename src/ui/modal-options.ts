import type { RepromptLevel } from "../core/types.js";
import { getPresetModels } from "../models/presets.js";
import { listProfiles } from "../profiles/registry.js";
import { listProviders } from "../providers/registry.js";
import type { SelectOption } from "./components/select-modal.js";

export type ModalCommandAction =
  "generate" | "profile" | "level" | "provider" | "model" | "result" | "diff" | "explain" | "copy";

export const LEVEL_OPTIONS: SelectOption<RepromptLevel>[] = [
  { label: "minimal", value: "minimal" },
  { label: "standard", value: "standard" },
  { label: "complete", value: "complete" },
];

export const HELP_OPTIONS: SelectOption<string>[] = [
  { label: "Entrée — générer", value: "generate" },
  { label: "Ctrl+P — profil", value: "profile" },
  { label: "Ctrl+L — niveau", value: "level" },
  { label: "Ctrl+M — modèle", value: "model" },
  { label: "Ctrl+D — diff", value: "diff" },
  { label: "Ctrl+R — régénérer", value: "regenerate" },
];

export function getProfileOptions(): SelectOption<string>[] {
  return [
    { label: "auto (détection)", value: "auto" },
    ...listProfiles().map((profile) => ({
      label: `${profile.name} — ${profile.description}`,
      value: profile.id,
    })),
  ];
}

export function getProviderOptions(): SelectOption<string>[] {
  return listProviders().map((id) => ({ label: id, value: id }));
}

export function getModelOptions(provider: string): SelectOption<string>[] {
  return getPresetModels()
    .filter((model) => model.provider === provider)
    .map((model) => ({ label: `${model.id} — ${model.name}`, value: model.id }));
}

export function getFallbackModelForProvider(provider: string): string {
  return getPresetModels().find((preset) => preset.provider === provider)?.id ?? "";
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
