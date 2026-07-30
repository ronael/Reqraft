import React from "react";

import type { RepromptLevel } from "../../core/types.js";
import type { ModalType } from "../app-state.js";
import {
  getCommandOptions,
  getModelOptions,
  getProfileOptions,
  getProviderOptions,
  HELP_OPTIONS,
  LEVEL_OPTIONS,
  type ModalCommandAction,
} from "../modal-options.js";
import { SelectModal } from "./select-modal.js";

interface AppModalProps {
  modal: NonNullable<ModalType>;
  provider: string;
  profile: string;
  level: RepromptLevel;
  model: string;
  hasResult: boolean;
  onSelectProfile: (profile: string) => void;
  onSelectLevel: (level: RepromptLevel) => void;
  onSelectProvider: (provider: string) => void;
  onSelectModel: (model: string) => void;
  onRunCommand: (action: ModalCommandAction) => void;
  onClose: () => void;
}

export function AppModal({
  modal,
  provider,
  profile,
  level,
  model,
  hasResult,
  onSelectProfile,
  onSelectLevel,
  onSelectProvider,
  onSelectModel,
  onRunCommand,
  onClose,
}: Readonly<AppModalProps>): React.JSX.Element | null {
  switch (modal) {
    case "profile":
      return (
        <SelectModal
          title="Changer de profil"
          options={getProfileOptions()}
          currentValue={profile}
          onSelect={onSelectProfile}
          onCancel={onClose}
        />
      );
    case "level":
      return (
        <SelectModal
          title="Changer de niveau"
          options={LEVEL_OPTIONS}
          currentValue={level}
          onSelect={onSelectLevel}
          onCancel={onClose}
        />
      );
    case "provider":
      return (
        <SelectModal
          title="Changer de provider"
          options={getProviderOptions()}
          currentValue={provider}
          onSelect={onSelectProvider}
          onCancel={onClose}
        />
      );
    case "model":
      return (
        <SelectModal
          title="Changer de modèle"
          options={getModelOptions(provider)}
          currentValue={model}
          onSelect={onSelectModel}
          onCancel={onClose}
        />
      );
    case "commands":
      return (
        <SelectModal
          title="Actions"
          options={getCommandOptions(hasResult)}
          onSelect={onRunCommand}
          onCancel={onClose}
        />
      );
    case "help":
      return (
        <SelectModal
          title="Raccourcis"
          options={HELP_OPTIONS}
          onSelect={onClose}
          onCancel={onClose}
        />
      );
  }
}
