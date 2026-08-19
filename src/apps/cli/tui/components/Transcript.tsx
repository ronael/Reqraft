/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { ScrollArea } from "@/apps/cli/tui/primitives/ScrollArea.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { ResultTurn } from "@/apps/cli/tui/components/ResultTurn.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";
import type { CommandContext, CommandId } from "@/apps/cli/tui/model/commands.js";
import type { ResultViewMode } from "@/apps/cli/ui/result-view.js";
import type { Translator } from "@/i18n/translate.js";

export interface TranscriptProps {
  prompt: string;
  state: ResultState;
  view: ResultViewMode;
  context: CommandContext;
  height: number;
  focused?: boolean;
  t: Translator;
  onCommand?(id: CommandId): void;
}

/**
 * The vertical conversation: the current prompt and its result, stacked and
 * scrolled together.
 *
 * Not a chat history — there is exactly one exchange. The prompt stays as the
 * "you" turn even once a result exists, so the screen reads top-to-bottom
 * without losing what was asked. The whole region is a ScrollArea (OpenTUI's
 * scrollbox), so long content scrolls inside the transcript rather than
 * pushing the editor off screen.
 */
export function Transcript({
  prompt,
  state,
  view,
  context,
  height,
  focused = false,
  t,
  onCommand,
}: Readonly<TranscriptProps>): React.ReactNode {
  const { color } = theme.tokens;
  const hasPrompt = prompt.length > 0;
  const hasExchange = state.kind !== "empty" || hasPrompt;

  return (
    <ScrollArea height={height} focused={focused}>
      <Stack direction="column" gap="sm">
        {!hasExchange && (
          <text fg={color.textMuted}>
            <span attributes={TextAttributes.BOLD} fg={color.text}>
              {t("tui.turn.reqraft")}
            </span>
            <span> </span>
            <span>{t("tui.transcript.empty")}</span>
          </text>
        )}

        {hasPrompt && (
          <box style={{ flexDirection: "column" }}>
            <text fg={color.textMuted}>
              <span attributes={TextAttributes.BOLD} fg={color.accent}>
                {`▍ `}
              </span>
              <span attributes={TextAttributes.BOLD} fg={color.accent}>
                {t("tui.turn.you")}
              </span>
              <span> </span>
              <span>{t("tui.turn.user")}</span>
            </text>
            <text fg={color.text}>{prompt}</text>
          </box>
        )}

        {state.kind !== "empty" && (
          <ResultTurn state={state} view={view} context={context} t={t} onCommand={onCommand} />
        )}
      </Stack>
    </ScrollArea>
  );
}
