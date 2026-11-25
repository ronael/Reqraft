import { RepromptLevelSchema } from "@/core/levels.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { getProfile } from "@/profiles/registry.js";
import { selectLevel, selectProfile, updatePromptInput, type AppState } from "./app-state.js";

/**
 * What `rp edit` hands the interface when a terminal agent (Codex, Claude
 * Code…) opens it on the draft being typed: the draft, and the profile and
 * level `rp edit` was given, if any.
 */
export interface AgentDraftStart {
  draft: string;
  profile?: string;
  level?: string;
}

/** The draft in the editor, before the configuration is even read. */
export function withAgentDraft(state: AppState, start: AgentDraftStart): AppState {
  return updatePromptInput(state, start.draft);
}

/**
 * The profile and level `rp edit` was given, over the configured defaults.
 *
 * A value the interface does not know is left out rather than refused: the
 * header shows what will actually run, and the pickers are one key away.
 */
export function applyAgentDraftSettings(state: AppState, start: AgentDraftStart): AppState {
  const withProfile =
    start.profile === undefined ? state : selectKnownProfile(state, start.profile);
  const level = RepromptLevelSchema.safeParse(start.level);
  return level.success ? selectLevel(withProfile, level.data) : withProfile;
}

function selectKnownProfile(state: AppState, id: string): AppState {
  if (id === AUTO_PROFILE_ID) return selectProfile(state, AUTO_PROFILE_ID);
  // Aliases resolve to the profile's own id, the one the pickers use.
  const profile = getProfile(id);
  return profile === undefined ? state : selectProfile(state, profile.id, profile.defaultLevel);
}
