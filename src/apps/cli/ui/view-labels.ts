import type { ModalType, ViewMode } from "./app-state.js";

const RESULT_TITLES: Record<ViewMode, string> = {
  result: "Prompt amélioré",
  diff: "Diff",
  explain: "Explication",
};

const EMPTY_STATE_TITLES: Record<ViewMode, string> = {
  result: "Aucun résultat pour le moment.",
  diff: "Le diff sera disponible après une génération.",
  explain: "L’explication sera disponible après une génération.",
};

const MODAL_TITLES: Record<NonNullable<ModalType>, string> = {
  help: "Aide",
  commands: "Palette d’actions",
  profile: "Sélection",
  level: "Sélection",
  provider: "Sélection",
  model: "Sélection",
};

export function getResultTitle(view: ViewMode): string {
  return RESULT_TITLES[view];
}

export function getEmptyStateTitle(view: ViewMode): string {
  return EMPTY_STATE_TITLES[view];
}

export function getModalTitle(modal: NonNullable<ModalType>): string {
  return MODAL_TITLES[modal];
}
