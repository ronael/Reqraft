/* @jsxImportSource @opentui/react */
import React, { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { Surface } from "@/apps/cli/tui/primitives/Surface.js";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { KeyHint } from "@/apps/cli/tui/primitives/KeyHint.js";
import { ScrollArea } from "@/apps/cli/tui/primitives/ScrollArea.js";
import { TextEditor } from "@/apps/cli/tui/primitives/TextEditor.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { COMMANDS, availableCommands } from "@/apps/cli/tui/model/commands.js";
import type { Density } from "@/apps/cli/tui/theme/components.js";
import { createTranslator } from "@/i18n/translate.js";
import { PromptEditor } from "@/apps/cli/tui/components/PromptEditor.js";
import { ResultPanel } from "@/apps/cli/tui/components/ResultPanel.js";
import { StatusBar } from "@/apps/cli/tui/components/StatusBar.js";
import { Toolbar } from "@/apps/cli/tui/components/Toolbar.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";

/**
 * Component gallery.
 *
 * Exists so the design can be iterated without running a generation: edit
 * `theme/tokens.ts`, relaunch, see every primitive and state at once. It is
 * intentionally not a Storybook — no addons, no controls beyond a density
 * toggle, nothing to maintain beyond the list of things it shows.
 */
export function Gallery(): React.ReactNode {
  const { height: terminalHeight } = useTerminalDimensions();
  const [density, setDensity] = useState<Density>("comfortable");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [draft, setDraft] = useState("Type here to exercise the editor.");
  const t = createTranslator("en");
  const { color } = theme.tokens;

  useKeyboard((key) => {
    if (key.name === "d")
      setDensity((current) => (current === "compact" ? "comfortable" : "compact"));
    if (key.name === "tab") setFocusedIndex((current) => (current + 1) % 3);
  });

  const tones = ["default", "accent", "success", "warning", "error"] as const;
  const SETTINGS = {
    profile: "auto",
    level: "standard",
    provider: "openai",
    model: "gpt-4.1-mini",
  };

  return (
    <box
      style={{
        flexDirection: "column",
        backgroundColor: color.background,
        padding: 1,
        gap: 1,
        width: "100%",
        height: "100%",
      }}
    >
      <text>
        <span attributes={TextAttributes.BOLD} fg={color.accent}>
          {"Reqraft TUI lab"}
        </span>
        <span
          fg={color.textMuted}
        >{`  ·  density: ${density}  ·  d toggles density, arrows scroll, ^C quits`}</span>
      </text>

      <ScrollArea height={Math.max(4, terminalHeight - 3)}>
        <Stack direction="row" gap="xs">
          {tones.map((tone) => (
            <Surface key={tone} title={tone} tone={tone} density={density}>
              <text fg={color.textSubtle}>{"tone sample"}</text>
            </Surface>
          ))}
        </Stack>

        <Stack direction="row" gap="xs">
          <Surface title="focused" tone="default" density={density} focused>
            <text fg={color.textSubtle}>{"focused border"}</text>
          </Surface>
          <Surface title="bare" bare density={density}>
            <text fg={color.textSubtle}>{"no border"}</text>
          </Surface>
          <Surface title="empty" density={density}>
            <text fg={color.textMuted}>{"nothing yet"}</text>
          </Surface>
        </Stack>

        <Surface title="TextEditor" density={density} focused={focusedIndex === 0}>
          <TextEditor
            value={draft}
            focused={focusedIndex === 0}
            placeholder="Placeholder state"
            onChange={setDraft}
          />
        </Surface>

        <Surface title="ScrollArea" density={density} focused={focusedIndex === 1}>
          <ScrollArea height={5} focused={focusedIndex === 1}>
            {Array.from({ length: 20 }, (_, index) => (
              <text
                key={index}
                fg={color.textSubtle}
              >{`scrollable line ${String(index + 1)}`}</text>
            ))}
          </ScrollArea>
        </Surface>

        <Surface title="KeyHint · available" density={density} focused={focusedIndex === 2}>
          <Stack direction="row" gap="sm">
            {availableCommands({
              hasOverlay: false,
              hasResult: true,
              isGenerating: false,
              inputLength: 4,
            })
              .slice(0, 6)
              .map((command) => (
                <KeyHint key={command.id} command={command} t={t} />
              ))}
          </Stack>
        </Surface>

        <Surface title="PromptEditor · empty / filled / disabled" density={density}>
          <Stack direction="row" gap="xs">
            <PromptEditor
              value=""
              focused={false}
              rows={2}
              placeholder="Empty state"
              density={density}
              t={t}
              onChange={() => undefined}
            />
            <PromptEditor
              value="filled prompt"
              focused
              rows={2}
              meta="mock-model"
              density={density}
              t={t}
              onChange={() => undefined}
            />
            <PromptEditor
              value="disabled while generating"
              focused={false}
              rows={2}
              disabled
              density={density}
              t={t}
              onChange={() => undefined}
            />
          </Stack>
        </Surface>

        <Surface title="ResultPanel · every state" density={density}>
          <Stack direction="row" gap="xs">
            {(
              [
                { kind: "empty" },
                { kind: "loading" },
                { kind: "streaming", partial: "streaming…" },
                { kind: "success", text: "finished output" },
                { kind: "error", title: "Provider failed", message: "network unreachable" },
              ] satisfies ResultState[]
            ).map((state, index) => (
              <ResultPanel
                key={index}
                state={state}
                focused={false}
                height={3}
                density={density}
                emptyHint="nothing yet"
                loadingLabel="generating…"
                t={t}
              />
            ))}
          </Stack>
        </Surface>

        <Surface title="Toolbar · normal then compact" density={density}>
          <Stack direction="column" gap="xs">
            <Toolbar values={SETTINGS} t={t} />
            <Toolbar values={SETTINGS} t={t} compact />
          </Stack>
        </Surface>

        <Surface title="StatusBar · with and without a result" density={density}>
          <Stack direction="column" gap="xs">
            <StatusBar
              context={{ hasOverlay: false, hasResult: true, isGenerating: false, inputLength: 4 }}
              t={t}
            />
            <StatusBar
              context={{ hasOverlay: false, hasResult: false, isGenerating: false, inputLength: 0 }}
              t={t}
            />
          </Stack>
        </Surface>

        <Surface title="KeyHint · disabled" density={density}>
          <Stack direction="row" gap="sm">
            {COMMANDS.slice(0, 6).map((command) => (
              <KeyHint key={command.id} command={command} t={t} disabled />
            ))}
          </Stack>
        </Surface>
      </ScrollArea>
    </box>
  );
}
