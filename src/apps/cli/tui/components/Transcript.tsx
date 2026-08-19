/* @jsxImportSource @opentui/react */
import { ResultTurn } from "@/apps/cli/tui/components/ResultTurn.js";
import type { CommandContext, CommandId } from "@/apps/cli/tui/model/commands.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";
import { Rail } from "@/apps/cli/tui/primitives/Rail.js";
import { ScrollArea } from "@/apps/cli/tui/primitives/ScrollArea.js";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import type { ResultViewMode } from "@/apps/cli/ui/result-view.js";
import type { Translator } from "@/i18n/translate.js";
import { TextAttributes } from "@opentui/core";
import React from "react";

export interface TranscriptProps {
  /** Live editor content — the "you" turn only when nothing has been submitted. */
  /**
   * The prompt that was actually submitted, snapshotted when generation
   * started. Used so editing the editor after a run does not rewrite history.
   * `result.original` takes precedence once a result exists.
   */
  submittedPrompt: string | null;
  state: ResultState;
  view: ResultViewMode;
  context: CommandContext;
  height: number;
  focused?: boolean;
  t: Translator;
  onCommand?(id: CommandId): void;
}

/**
 * The vertical conversation: the submitted prompt and its result, stacked and
 * scrolled together.
 *
 * Not a chat history — there is exactly one exchange. The prompt stays as the
 * "you" turn even once a result exists, so the screen reads top-to-bottom
 * without losing what was asked. The "you" text is the *submitted* prompt, not
 * the live editor buffer: once a result exists it must not change retroactively
 * if the user edits the textarea. The whole region is a ScrollArea (OpenTUI's
 * scrollbox), so long content scrolls inside the transcript rather than
 * pushing the editor off screen.
 */
export function Transcript({
  submittedPrompt,
  state,
  view,
  context,
  height,
  focused = false,
  t,
  onCommand,
}: Readonly<TranscriptProps>): React.ReactNode {
  const { color } = theme.tokens;

  // The "you" turn is a record of what was SENT, never a mirror of what is
  // being typed. Falling back to the live prompt drew the editor's contents a
  // second time in the transcript, so the same paragraph appeared twice and
  // looked like a generation had already started.
  const youText =
    state.kind === "success" && state.original !== undefined ? state.original : submittedPrompt;
  const showYou = youText !== null && youText !== "";
  const hasExchange = state.kind !== "empty" || showYou;

  return (
    <ScrollArea height={height} focused={focused} sticky={state.kind === "streaming"}>
      <Stack direction="column" gap="sm">
        {!hasExchange && (
          <Rail color={color.border}>
            <text fg={color.textMuted}>
              <span attributes={TextAttributes.BOLD} fg={color.text}>
                {t("tui.turn.reqraft")}
              </span>
              <span> </span>
              <span>{t("tui.transcript.empty")}</span>
            </text>
          </Rail>
        )}

        {showYou && (
          <Rail color={color.border}>
            <text fg={color.textMuted}>
              <span attributes={TextAttributes.BOLD} fg={color.accent}>
                {t("tui.turn.you")}
              </span>
              <span> </span>
              <span>{t("tui.turn.user")}</span>
            </text>
            <text fg={color.text}>{youText}</text>
          </Rail>
        )}

        {state.kind !== "empty" && (
          <ResultTurn state={state} view={view} context={context} t={t} onCommand={onCommand} />
        )}
      </Stack>
    </ScrollArea>
  );
}
