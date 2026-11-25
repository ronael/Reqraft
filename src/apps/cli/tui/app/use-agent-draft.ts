import { useEffect, useRef } from "react";
import { COMMANDS_BY_ID, commandKeyLabel, type CommandId } from "@/apps/cli/tui/model/commands.js";
import type { AgentDraftStart } from "@/apps/cli/ui/agent-draft.js";
import type { Translator } from "@/i18n/translate.js";

/**
 * `rp edit` opened the interface on a terminal agent's draft. `use` writes
 * the kept text where the agent reads it back; quitting without it leaves the
 * draft as it was.
 */
export interface AgentDraftSession extends AgentDraftStart {
  use(text: string): Promise<void>;
}

interface AgentDraftReadiness {
  configReady: boolean;
  /** The configuration failed to load: its error is on screen instead. */
  failed: boolean;
}

/**
 * Rewrites the draft once, as soon as the configuration is ready, and says
 * which keys send it back or leave it alone. After a failed configuration the
 * draft only waits in the editor: rewriting it would fail the same way.
 */
export function useAgentDraftStart(
  session: AgentDraftSession | undefined,
  { configReady, failed }: AgentDraftReadiness,
  generate: () => Promise<void>,
  showToast: (message: string, tone: "success" | "neutral") => void,
  t: Translator,
): void {
  const started = useRef(false);
  useEffect(() => {
    if (session === undefined || !configReady || started.current) return;
    started.current = true;
    showToast(t("tui.agentDraft.hint", { use: keyOf("use"), exit: keyOf("exit") }), "neutral");
    if (!failed) void generate();
  }, [configReady, failed, generate, session, showToast, t]);
}

/** The chord as the footer shows it, read from the registry so neither can drift. */
function keyOf(id: CommandId): string {
  const command = COMMANDS_BY_ID.get(id);
  return command === undefined ? "" : commandKeyLabel(command);
}
