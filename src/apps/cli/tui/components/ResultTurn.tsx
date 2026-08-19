/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { KeyHint } from "@/apps/cli/tui/primitives/KeyHint.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { formatDiff, type ResultViewMode } from "@/apps/cli/ui/result-view.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";
import { COMMANDS, type CommandContext, type CommandId } from "@/apps/cli/tui/model/commands.js";
import type { Translator } from "@/i18n/translate.js";

export interface ResultTurnProps {
  state: ResultState;
  view: ResultViewMode;
  context: CommandContext;
  t: Translator;
  /** Clicks on result actions converge on the same command as the keyboard. */
  onCommand?(id: CommandId): void;
}

const RESULT_ACTIONS: readonly CommandId[] = ["copy", "toggle-diff", "show-explain"];

function turnLabel(state: ResultState, view: ResultViewMode, t: Translator): string {
  switch (state.kind) {
    case "loading":
    case "streaming":
      return t("tui.header.preparing");
    case "error":
      return t("tui.turn.error");
    case "success":
      return successLabel(view, t);
    default:
      return t("tui.turn.reqraft");
  }
}

function successLabel(view: ResultViewMode, t: Translator): string {
  if (view === "diff") return t("tui.turn.diff");
  if (view === "explain") return t("tui.turn.explain");
  return t("tui.turn.result");
}

function toneFor(state: ResultState): "accent" | "error" {
  return state.kind === "error" ? "error" : "accent";
}

type SuccessState = Extract<ResultState, { kind: "success" }>;

function viewLines(state: SuccessState, view: ResultViewMode): string[] {
  if (view === "diff" && state.original !== undefined) {
    return formatDiff(state.original, state.text).split("\n");
  }
  if (view === "explain" && state.changes !== undefined) {
    return state.changes.map((change) => `- ${change}`);
  }
  return state.text.split("\n");
}

interface MetaPart {
  text: string;
  color?: string;
}

/** Map a quality status to its real label and colour — never a blind "faithful". */
function qualityMeta(state: SuccessState, t: Translator): MetaPart | null {
  const status = state.quality?.status;
  const { color } = theme.tokens;
  switch (status) {
    case "good":
      return { text: t("quality.statusGood"), color: color.success };
    case "review":
      return { text: t("quality.statusReview"), color: color.warning };
    case "risky":
      return { text: t("quality.statusRisky"), color: color.error };
    default:
      return null;
  }
}

function resultMeta(state: SuccessState, t: Translator): MetaPart[] {
  const parts: MetaPart[] = [];
  const quality = qualityMeta(state, t);
  if (quality) parts.push(quality);
  if (state.latencyMs !== undefined)
    parts.push({ text: `${(state.latencyMs / 1000).toFixed(1)} s` });
  if (state.provider && state.model) parts.push({ text: `${state.provider}/${state.model}` });
  return parts;
}

function successBody(
  state: SuccessState,
  view: ResultViewMode,
  context: CommandContext,
  t: Translator,
  onCommand?: (id: CommandId) => void,
): React.ReactNode {
  const { color } = theme.tokens;
  const isDiff = view === "diff" && state.original !== undefined;
  const meta = resultMeta(state, t);

  return (
    <Stack direction="column" gap="xs">
      <Stack direction="column" gap="xs">
        {viewLines(state, view).map((line, index) => (
          <text key={index} fg={isDiff ? diffColor(line) : color.text}>
            {line}
          </text>
        ))}
      </Stack>

      {meta.length > 0 && (
        <text fg={color.textMuted}>
          {meta.map((part, index) => (
            <span key={part.text}>
              {index > 0 && <span>{` · `}</span>}
              <span fg={part.color}>{part.text}</span>
            </span>
          ))}
        </text>
      )}

      <Stack direction="row" gap="sm">
        {COMMANDS.filter(
          (command) =>
            RESULT_ACTIONS.includes(command.id) &&
            command.isAvailable({ ...context, hasResult: true }),
        ).map((command) => (
          <KeyHint
            key={command.id}
            command={command}
            t={t}
            onActivate={
              onCommand === undefined
                ? undefined
                : () => {
                    onCommand(command.id);
                  }
            }
          />
        ))}
      </Stack>
    </Stack>
  );
}

function diffColor(line: string): string {
  const { color } = theme.tokens;
  if (line.startsWith("+")) return color.success;
  if (line.startsWith("-")) return color.error;
  return color.textMuted;
}

function renderBody(
  state: ResultState,
  view: ResultViewMode,
  context: CommandContext,
  t: Translator,
  onCommand?: (id: CommandId) => void,
): React.ReactNode {
  const { color } = theme.tokens;
  if (state.kind === "empty") {
    return null;
  }
  if (state.kind === "loading") {
    return <text fg={color.accent}>{t("tui.result.loading")}</text>;
  }
  if (state.kind === "streaming") {
    return <text fg={color.text}>{state.partial}</text>;
  }
  if (state.kind === "error") {
    return (
      <Stack direction="column" gap="xs">
        <text attributes={TextAttributes.BOLD} fg={color.error}>
          {state.title}
        </text>
        <text fg={color.textSubtle}>{state.message}</text>
        {state.nextAction && <text fg={color.textMuted}>{state.nextAction}</text>}
      </Stack>
    );
  }
  return successBody(state, view, context, t, onCommand);
}

export function ResultTurn({
  state,
  view,
  context,
  t,
  onCommand,
}: Readonly<ResultTurnProps>): React.ReactNode {
  const { color } = theme.tokens;
  const label = turnLabel(state, view, t);
  const tone = toneFor(state);
  const showBody = state.kind !== "empty";
  const markColor = tone === "error" ? color.error : color.accent;

  return (
    <box style={{ flexDirection: "column" }}>
      <text fg={color.textMuted}>
        <span attributes={TextAttributes.BOLD} fg={markColor}>
          {`▍ `}
        </span>
        <span attributes={TextAttributes.BOLD} fg={tone === "error" ? color.error : color.text}>
          {t("tui.turn.reqraft")}
        </span>
        <span> </span>
        <span>{label}</span>
      </text>
      {showBody && (
        <box style={{ marginTop: theme.tokens.spacing.xs }}>
          {renderBody(state, view, context, t, onCommand)}
        </box>
      )}
    </box>
  );
}
