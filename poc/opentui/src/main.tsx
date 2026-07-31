import {
  createCliRenderer,
  TextAttributes,
  type KeyEvent,
  type MouseEvent,
} from "@opentui/core";
import {
  createRoot,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LEVEL_OPTIONS,
  MODEL_OPTIONS,
  PROFILE_OPTIONS,
  PROVIDER_OPTIONS,
  useTuiController,
} from "./controller.js";
import type { FocusElement, Option, OverlayId, ProfileId, ProviderId, RepromptLevel } from "./types.js";

const COLOR = {
  bg: "#09090b",
  panel: "#111113",
  panelSoft: "#17171a",
  border: "#3f3f46",
  borderSoft: "#27272a",
  text: "#e4e4e7",
  muted: "#71717a",
  subtle: "#a1a1aa",
  accent: "#a78bfa",
  accentStrong: "#8b5cf6",
  success: "#34d399",
  warning: "#fbbf24",
  error: "#fb7185",
} as const;

const SHORTCUTS = [
  "^G Générer",
  "^P Profil",
  "^L Niveau",
  "^I Provider",
  "^O Modèle",
  "^E Erreur",
  "↑↓ Scroll",
  "^R Reset",
  "Tab Focus",
] as const;

type BadgeId = "profile" | "level" | "provider" | "model";

interface MouseZone {
  id: BadgeId;
  row: number;
  start: number;
  end: number;
}

interface Layout {
  width: number;
  height: number;
  textWidth: number;
  compact: boolean;
  editorRows: number;
  resultRows: number;
  warningRows: number;
  actionRows: number;
  badgeRow: number;
  badgeZones: MouseZone[];
  pickerTop: number;
  pickerLeft: number;
  pickerWidth: number;
}

function App(): React.ReactNode {
  const controller = useTuiController();
  const { state } = controller;
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();
  const layout = useMemo(
    () => createLayout(terminalWidth, terminalHeight, state.provider, state.model),
    [terminalWidth, terminalHeight, state.provider, state.model],
  );
  const renderer = useRenderer();
  const [pickerIndex, setPickerIndex] = useState(0);
  const [editorScroll, setEditorScroll] = useState(0);
  const [resultScroll, setResultScroll] = useState(0);

  const openOverlay = (overlay: Exclude<OverlayId, null>): void => {
    controller.setOverlay(overlay);
    setPickerIndex(0);
  };

  const closeOverlay = (): void => {
    controller.setOverlay(null);
  };

  const generate = (): void => {
    void controller.generate(state.input);
  };

  useEffect(() => {
    setEditorScroll((previous) => clampScroll(previous, state.input, layout.textWidth, layout.editorRows));
  }, [layout.editorRows, layout.textWidth, state.input]);

  useEffect(() => {
    if (state.status === "loading") setResultScroll(0);
    if (state.status === "streaming") {
      setResultScroll(maxScroll(state.result, layout.textWidth, layout.resultRows));
    }
  }, [layout.resultRows, layout.textWidth, state.result, state.status]);

  useEffect(() => {
    const onMouse = (event: MouseEvent) => {
      if (event.type !== "down" || event.button !== 0) return;
      if (state.activeOverlay && state.activeOverlay !== "help") {
        const optionIndex = pickerOptionIndexAt(
          layout,
          event.y,
          optionsForOverlay(state.activeOverlay, state.provider).length,
        );
        if (optionIndex !== null) {
          selectOverlayValue(controller, state.activeOverlay, String(optionIndex));
          return;
        }
      }

      const zone = layout.badgeZones.find(
        (candidate) =>
          event.y === candidate.row && event.x >= candidate.start && event.x <= candidate.end,
      );
      if (!zone) return;
      openOverlay(zone.id);
    };

    renderer.on("mouse", onMouse);
    return () => {
      renderer.off("mouse", onMouse);
    };
  }, [controller, layout, renderer, state.activeOverlay, state.provider]);

  useKeyboard((key: KeyEvent) => {
    if (state.activeOverlay) {
      handleOverlayKey({
        key,
        stateOverlay: state.activeOverlay,
        pickerIndex,
        setPickerIndex,
        optionCount:
          state.activeOverlay === "help"
            ? 0
            : optionsForOverlay(state.activeOverlay, state.provider).length,
        closeOverlay,
        selectValue: (value) => selectOverlayValue(controller, state.activeOverlay, value),
      });
      return;
    }

    if (key.ctrl && key.name === "c") {
      renderer.stop();
      return;
    }
    if (key.name === "escape") {
      renderer.stop();
      return;
    }
    if (key.name === "tab") {
      controller.setFocus(state.focusedElement === "editor" ? "result" : "editor");
      return;
    }
    if (isScrollUpKey(key)) {
      if (state.focusedElement === "editor") {
        setEditorScroll((previous) => Math.max(0, previous - scrollStep(key, layout.editorRows)));
      } else {
        setResultScroll((previous) => Math.max(0, previous - scrollStep(key, layout.resultRows)));
      }
      return;
    }
    if (isScrollDownKey(key)) {
      if (state.focusedElement === "editor") {
        setEditorScroll((previous) =>
          Math.min(
            maxScroll(state.input, layout.textWidth, layout.editorRows),
            previous + scrollStep(key, layout.editorRows),
          ),
        );
      } else {
        setResultScroll((previous) =>
          Math.min(
            maxScroll(state.result, layout.textWidth, layout.resultRows),
            previous + scrollStep(key, layout.resultRows),
          ),
        );
      }
      return;
    }
    if (key.ctrl && key.name === "g") {
      generate();
      return;
    }
    if (key.ctrl && key.name === "p") {
      openOverlay("profile");
      return;
    }
    if (key.ctrl && key.name === "l") {
      openOverlay("level");
      return;
    }
    if (key.ctrl && key.name === "i") {
      openOverlay("provider");
      return;
    }
    if (key.ctrl && key.name === "o") {
      openOverlay("model");
      return;
    }
    if (key.ctrl && key.name === "e") {
      controller.simulateError();
      return;
    }
    if (key.ctrl && key.name === "r") {
      controller.resetResult();
      return;
    }
    if (key.ctrl && key.name === "y") {
      void controller.copyResult();
      return;
    }
    if (key.name === "?" || key.sequence === "?") {
      openOverlay("help");
      return;
    }
    if (state.focusedElement === "editor") {
      handleEditorKey(key, controller.setInput, state.input);
    }
  });

  return (
    <box
      style={{
        width: layout.width,
        height: layout.height,
        flexDirection: "column",
        padding: layout.compact ? 0 : 1,
        rowGap: layout.compact ? 0 : 1,
        backgroundColor: COLOR.bg,
      }}
    >
      <Header
        width={layout.width}
        provider={state.provider}
        model={state.model}
        status={state.status}
        compact={layout.compact}
      />

      <Panel
        title="Prompt original"
        meta={describeInput(state.input)}
        tone="accent"
        focused={state.focusedElement === "editor" && !state.activeOverlay}
      >
        <EditorViewport
          text={state.input}
          rows={layout.editorRows}
          width={layout.textWidth}
          scrollOffset={editorScroll}
          focused={state.focusedElement === "editor" && !state.activeOverlay}
        />
      </Panel>

      <ContextBar
        profile={state.profile}
        level={state.level}
        provider={state.provider}
        model={state.model}
        compact={layout.compact}
      />

      <Panel
        title={resultTitle(state.status, state.result)}
        meta={resultMeta(state)}
        tone={resultTone(state.status)}
        focused={state.focusedElement === "result" && !state.activeOverlay}
      >
        <ResultArea
          result={state.result}
          warning={state.warning}
          error={state.error}
          status={state.status}
          rows={layout.resultRows}
          warningRows={layout.warningRows}
          textWidth={layout.textWidth}
          scrollOffset={resultScroll}
        />
      </Panel>

      <ActionBar
        compact={layout.compact}
        status={state.status}
        width={layout.width}
        rows={layout.actionRows}
      />
      {state.copied && <Toast message="Résultat copié dans le presse-papiers mock." />}

      <Picker
        overlay={state.activeOverlay}
        provider={state.provider}
        profile={state.profile}
        level={state.level}
        model={state.model}
        highlighted={pickerIndex}
        layout={layout}
      />
    </box>
  );
}

function Header({
  width,
  provider,
  model,
  status,
  compact,
}: {
  width: number;
  provider: string;
  model: string;
  status: string;
  compact: boolean;
}): React.ReactNode {
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <text>
        <span fg={COLOR.accent} attributes={TextAttributes.BOLD}>
          reqraft
        </span>
        {!compact && <span attributes={TextAttributes.DIM}>  POC OpenTUI</span>}
      </text>
      <text attributes={TextAttributes.DIM}>
        {compact ? `${provider} / ${status}` : `${provider} / ${model} / ${status} / ${width} cols`}
      </text>
    </box>
  );
}

function Panel({
  title,
  meta,
  tone,
  focused,
  grow = false,
  children,
}: {
  title: string;
  meta?: string;
  tone: "accent" | "neutral" | "success" | "warning" | "error";
  focused?: boolean;
  grow?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <box
      style={{
        border: true,
        borderStyle: focused ? "double" : "single",
        borderColor: toneColor(tone),
        backgroundColor: COLOR.panel,
        padding: 1,
        flexDirection: "column",
        flexGrow: grow ? 1 : 0,
      }}
    >
      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <text>
          <span fg={toneColor(tone)}>› </span>
          <span attributes={TextAttributes.BOLD}>{title}</span>
        </text>
        {meta && <text attributes={TextAttributes.DIM}>{meta}</text>}
      </box>
      {children}
    </box>
  );
}

function ContextBar({
  profile,
  level,
  provider,
  model,
  compact,
}: {
  profile: string;
  level: string;
  provider: string;
  model: string;
  compact: boolean;
}): React.ReactNode {
  if (compact) {
    return (
      <box style={{ flexDirection: "row", columnGap: 2, flexWrap: "wrap" }}>
        <CompactBadge label="Profil" value={profile} shortcut="^P" />
        <CompactBadge label="Niveau" value={level} shortcut="^L" />
        <CompactBadge label="Provider" value={provider} shortcut="^I" />
        <CompactBadge label="Modèle" value={shortModel(model)} shortcut="^O" />
      </box>
    );
  }

  return (
    <box style={{ flexDirection: "row", columnGap: 2, flexWrap: "wrap" }}>
      <Badge label="profil" value={profile} shortcut="^P" />
      <Badge label="niveau" value={level} shortcut="^L" />
      <Badge label="provider" value={provider} shortcut="^I" />
      <Badge label="modèle" value={model} shortcut="^O" />
    </box>
  );
}

function CompactBadge({
  label,
  value,
  shortcut,
}: {
  label: string;
  value: string;
  shortcut: string;
}): React.ReactNode {
  return (
    <text>
      <span attributes={TextAttributes.DIM}>{label}</span>
      <span> </span>
      <span fg={COLOR.text}>{value}</span>
      <span> </span>
      <span fg={COLOR.accent}>{shortcut}</span>
    </text>
  );
}

function Badge({
  label,
  value,
  shortcut,
}: {
  label: string;
  value: string;
  shortcut: string;
}): React.ReactNode {
  return (
    <box
      style={{
        border: true,
        borderStyle: "single",
        borderColor: COLOR.borderSoft,
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        columnGap: 1,
      }}
    >
      <text attributes={TextAttributes.DIM}>{label}</text>
      <text fg={COLOR.text}>{value}</text>
      <text fg={COLOR.accent}>{shortcut}</text>
    </box>
  );
}

function ResultArea({
  result,
  warning,
  error,
  status,
  rows,
  warningRows,
  textWidth,
  scrollOffset,
}: {
  result: string;
  warning?: string;
  error?: string;
  status: string;
  rows: number;
  warningRows: number;
  textWidth: number;
  scrollOffset: number;
}): React.ReactNode {
  if (error && !result) {
    return (
      <box style={{ flexDirection: "column", marginTop: 1, rowGap: 1 }}>
        <text fg={COLOR.error} attributes={TextAttributes.BOLD}>
          Provider mock indisponible
        </text>
        <text fg={COLOR.error}>{error}</text>
        <text attributes={TextAttributes.DIM}>Ctrl+E revient à l’état précédent. Ctrl+G relance.</text>
      </box>
    );
  }

  if (!result && status === "idle") {
    return (
      <box style={{ flexDirection: "column", marginTop: 2, alignItems: "center" }}>
        <text attributes={TextAttributes.DIM}>Aucun résultat pour le moment.</text>
        <text attributes={TextAttributes.DIM}>Appuie sur Ctrl+G pour lancer le faux streaming.</text>
      </box>
    );
  }

  if (!result && status === "loading") {
    return (
      <box style={{ flexDirection: "column", marginTop: 2, alignItems: "center" }}>
        <text fg={COLOR.accent}>Préparation de la génération mock…</text>
        <text attributes={TextAttributes.DIM}>Le premier delta arrive dans un instant.</text>
      </box>
    );
  }

  return (
    <box style={{ flexDirection: "column", rowGap: 1, marginTop: 1, flexGrow: 0 }}>
      {error && (
        <TextViewport
          text={`! ${error} Ctrl+E revient au résultat.`}
          rows={warningRows}
          width={textWidth}
          tone="error"
        />
      )}
      {!error && warning && (
        <TextViewport
          text={`! ${warning}`}
          rows={warningRows}
          width={textWidth}
          tone="warning"
          scrollable={false}
        />
      )}
      <TextViewport text={result} rows={rows} width={textWidth} scrollOffset={scrollOffset} />
    </box>
  );
}

function EditorViewport({
  text,
  rows,
  width,
  scrollOffset,
  focused,
}: {
  text: string;
  rows: number;
  width: number;
  scrollOffset: number;
  focused: boolean;
}): React.ReactNode {
  const value = focused ? `${text}█` : text;
  return (
    <box style={{ marginTop: 1 }}>
      <TextViewport text={value} rows={rows} width={width} scrollOffset={scrollOffset} />
    </box>
  );
}

function TextViewport({
  text,
  rows,
  width,
  scrollOffset = 0,
  tone = "text",
  scrollable = true,
}: {
  text: string;
  rows: number;
  width: number;
  scrollOffset?: number;
  tone?: "text" | "warning" | "error";
  scrollable?: boolean;
}): React.ReactNode {
  const lines = wrapText(text, width);
  const visibleRows = Math.max(1, rows);
  const maxOffset = Math.max(0, lines.length - visibleRows);
  const offset = Math.min(maxOffset, Math.max(0, scrollOffset));
  const hiddenAbove = offset;
  const hiddenBelow = Math.max(0, lines.length - offset - visibleRows);
  const shouldShowIndicator = scrollable && (hiddenAbove > 0 || hiddenBelow > 0);
  const contentRows = shouldShowIndicator ? Math.max(1, visibleRows - 1) : visibleRows;
  const visibleLines = lines.slice(offset, offset + contentRows);
  if (shouldShowIndicator) {
    visibleLines.push(scrollIndicator(hiddenAbove, hiddenBelow));
  }

  return (
    <box
      style={{
        flexDirection: "column",
        height: visibleRows,
        flexGrow: 0,
      }}
    >
      {visibleLines.map((line, index) => (
        <text key={`${index}-${line}`} fg={toneColorForText(tone)} style={{ width }}>
          {line.slice(0, width) || " "}
        </text>
      ))}
    </box>
  );
}

function ActionBar({
  compact,
  status,
  width,
  rows,
}: {
  compact: boolean;
  status: string;
  width: number;
  rows: number;
}): React.ReactNode {
  const visible = compact ? SHORTCUTS.slice(0, 7) : SHORTCUTS;
  return (
    <box
      style={{
        width,
        height: rows,
        flexDirection: "row",
        columnGap: compact ? 1 : 2,
        flexWrap: "wrap",
        backgroundColor: COLOR.bg,
      }}
    >
      {visible.map((shortcut) => (
        <text key={shortcut} attributes={TextAttributes.DIM}>
          {shortcut}
        </text>
      ))}
      {!compact && (
        <text fg={status === "streaming" ? COLOR.accent : COLOR.muted}>
          {status === "streaming" ? "réception des tokens…" : "prêt"}
        </text>
      )}
    </box>
  );
}

function Toast({ message }: { message: string }): React.ReactNode {
  return (
    <box
      style={{
        position: "absolute",
        right: 2,
        bottom: 1,
        border: true,
        borderStyle: "single",
        borderColor: COLOR.success,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: COLOR.panelSoft,
        zIndex: 20,
      }}
    >
      <text fg={COLOR.success}>{message}</text>
    </box>
  );
}

function Picker({
  overlay,
  provider,
  profile,
  level,
  model,
  highlighted,
  layout,
}: {
  overlay: OverlayId;
  provider: ProviderId;
  profile: ProfileId;
  level: RepromptLevel;
  model: string;
  highlighted: number;
  layout: Layout;
}): React.ReactNode {
  if (!overlay) return <box />;
  if (overlay === "help") {
    return <HelpOverlay layout={layout} />;
  }

  const options = optionsForOverlay(overlay, provider);
  const currentValue = currentValueForOverlay({ overlay, profile, level, provider, model });
  const safeIndex = Math.min(highlighted, Math.max(0, options.length - 1));

  return (
    <box
      style={{
        position: "absolute",
        top: layout.pickerTop,
        left: layout.pickerLeft,
        width: layout.pickerWidth,
        border: true,
        borderStyle: "double",
        borderColor: COLOR.accent,
        backgroundColor: COLOR.panelSoft,
        padding: 1,
        zIndex: 10,
        flexDirection: "column",
        rowGap: layout.compact ? 0 : 1,
      }}
    >
      <text>
        <span fg={COLOR.accent}>⌘ </span>
        <span attributes={TextAttributes.BOLD}>{pickerTitle(overlay)}</span>
        <span attributes={TextAttributes.DIM}>
          {layout.compact ? "  ↑↓ · Entrée · Esc" : "  ↑↓ naviguer · Entrée choisir · Esc fermer"}
        </span>
      </text>
      {options.map((option, index) => (
        <text key={option.value}>
          <span fg={index === safeIndex ? COLOR.accent : COLOR.muted}>
            {index === safeIndex ? "›" : " "}
          </span>
          <span fg={option.value === currentValue ? COLOR.success : COLOR.subtle}>
            {option.value === currentValue ? " ● " : " ○ "}
          </span>
          <span attributes={index === safeIndex ? TextAttributes.BOLD : undefined}>
            {option.label}
          </span>
          {option.description && <span attributes={TextAttributes.DIM}> — {option.description}</span>}
        </text>
      ))}
      <text attributes={TextAttributes.DIM}>
        Souris : clique les badges pour ouvrir. Clavier : Entrée choisit, Esc annule.
      </text>
    </box>
  );
}

function HelpOverlay({
  layout,
}: {
  layout: Layout;
}): React.ReactNode {
  return (
    <box
      style={{
        position: "absolute",
        top: layout.pickerTop,
        left: layout.pickerLeft,
        width: layout.pickerWidth,
        border: true,
        borderStyle: "double",
        borderColor: COLOR.accent,
        backgroundColor: COLOR.panelSoft,
        padding: 1,
        zIndex: 10,
        flexDirection: "column",
        rowGap: 1,
      }}
    >
      <text attributes={TextAttributes.BOLD}>Aide du POC OpenTUI</text>
      <text attributes={TextAttributes.DIM}>
        Ce POC ne contacte aucun provider. Il valide seulement renderer, clavier, souris,
        textarea, scrollbox et états.
      </text>
      <text>Ctrl+G lance un faux streaming. Ctrl+E bascule l’erreur. Tab change le focus.</text>
      <text>↑↓, PageUp/PageDown ou Ctrl+U/Ctrl+D scrollent la zone active.</text>
      <text>Les badges sont cliquables : profil, niveau, provider, modèle.</text>
      <text attributes={TextAttributes.DIM}>Esc ferme cette aide.</text>
    </box>
  );
}

function handleOverlayKey({
  key,
  stateOverlay,
  pickerIndex,
  setPickerIndex,
  optionCount,
  closeOverlay,
  selectValue,
}: {
  key: KeyEvent;
  stateOverlay: OverlayId;
  pickerIndex: number;
  setPickerIndex: React.Dispatch<React.SetStateAction<number>>;
  optionCount: number;
  closeOverlay: () => void;
  selectValue: (value: string) => void;
}): void {
  if (key.name === "escape") {
    closeOverlay();
    return;
  }
  if (stateOverlay === "help") return;
  if (key.name === "up") {
    setPickerIndex((previous) => Math.max(0, previous - 1));
    return;
  }
  if (key.name === "down") {
    setPickerIndex((previous) => Math.min(Math.max(0, optionCount - 1), previous + 1));
    return;
  }
  if (key.name === "return") {
    selectValue(String(Math.min(Math.max(0, optionCount - 1), pickerIndex)));
  }
}

function selectOverlayValue(
  controller: ReturnType<typeof useTuiController>,
  overlay: OverlayId,
  valueOrIndex: string,
): void {
  if (!overlay || overlay === "help") return;
  const options = optionsForOverlay(overlay, controller.state.provider);
  const option = options[Number.isInteger(Number(valueOrIndex)) ? Number(valueOrIndex) : -1] ??
    options.find((candidate) => candidate.value === valueOrIndex);
  if (!option) return;

  if (overlay === "profile") controller.setProfile(option.value as ProfileId);
  if (overlay === "level") controller.setLevel(option.value as RepromptLevel);
  if (overlay === "provider") controller.setProvider(option.value as ProviderId);
  if (overlay === "model") controller.setModel(option.value);
}

function optionsForOverlay(overlay: Exclude<OverlayId, null | "help">, provider: ProviderId): Option<string>[] {
  if (overlay === "profile") return PROFILE_OPTIONS;
  if (overlay === "level") return LEVEL_OPTIONS;
  if (overlay === "provider") return PROVIDER_OPTIONS;
  return MODEL_OPTIONS[provider];
}

function currentValueForOverlay({
  overlay,
  profile,
  level,
  provider,
  model,
}: {
  overlay: Exclude<OverlayId, null | "help">;
  profile: ProfileId;
  level: RepromptLevel;
  provider: ProviderId;
  model: string;
}): string {
  if (overlay === "profile") return profile;
  if (overlay === "level") return level;
  if (overlay === "provider") return provider;
  return model;
}

function pickerTitle(overlay: Exclude<OverlayId, null | "help">): string {
  if (overlay === "profile") return "Changer de profil";
  if (overlay === "level") return "Changer de niveau";
  if (overlay === "provider") return "Changer de provider";
  return "Changer de modèle";
}

function resultTitle(status: string, result: string): string {
  if (status === "error" && !result) return "Erreur";
  if (status === "loading" || status === "streaming") return "Génération";
  return "Prompt amélioré";
}

function resultTone(status: string): "neutral" | "accent" | "success" | "error" {
  if (status === "error") return "error";
  if (status === "loading" || status === "streaming") return "accent";
  if (status === "success") return "success";
  return "neutral";
}

function resultMeta(state: ReturnType<typeof useTuiController>["state"]): string {
  if (state.status === "idle") return "en attente";
  return `${(state.stats.elapsedMs / 1000).toFixed(1)} s · ${state.stats.inputTokens} entrée · ${state.stats.outputTokens} sortie`;
}

function describeInput(input: string): string {
  const lines = input.length === 0 ? 0 : input.split("\n").length;
  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  return `${lines} ligne${lines > 1 ? "s" : ""} · ${words} mot${words > 1 ? "s" : ""}`;
}

function toneColor(tone: "accent" | "neutral" | "success" | "warning" | "error"): string {
  if (tone === "accent") return COLOR.accent;
  if (tone === "success") return COLOR.success;
  if (tone === "warning") return COLOR.warning;
  if (tone === "error") return COLOR.error;
  return COLOR.border;
}

function toneColorForText(tone: "text" | "warning" | "error"): string {
  if (tone === "warning") return COLOR.warning;
  if (tone === "error") return COLOR.error;
  return COLOR.text;
}

function shortModel(model: string): string {
  return model.length > 14 ? `${model.slice(0, 11)}…` : model;
}

function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(12, width);
  return text.split("\n").flatMap((line) => wrapLine(line, safeWidth));
}

function wrapLine(line: string, width: number): string[] {
  if (!line) return [""];
  const chunks: string[] = [];
  let current = line;
  while (current.length > width) {
    const slice = current.slice(0, width + 1);
    const breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\t"));
    const end = breakAt > 8 ? breakAt : width;
    chunks.push(current.slice(0, end).trimEnd());
    current = current.slice(end).trimStart();
  }
  chunks.push(current);
  return chunks;
}

function scrollIndicator(hiddenAbove: number, hiddenBelow: number): string {
  const parts: string[] = [];
  if (hiddenAbove > 0) parts.push(`↑ ${hiddenAbove}`);
  if (hiddenBelow > 0) parts.push(`↓ ${hiddenBelow}`);
  return parts.join(" · ");
}

function maxScroll(text: string, width: number, rows: number): number {
  return Math.max(0, wrapText(text, width).length - Math.max(1, rows));
}

function clampScroll(offset: number, text: string, width: number, rows: number): number {
  return Math.min(Math.max(0, offset), maxScroll(text, width, rows));
}

function isScrollUpKey(key: KeyEvent): boolean {
  return key.name === "pageup" || key.name === "up" || (key.ctrl && key.name === "u");
}

function isScrollDownKey(key: KeyEvent): boolean {
  return key.name === "pagedown" || key.name === "down" || (key.ctrl && key.name === "d");
}

function scrollStep(key: KeyEvent, rows: number): number {
  if (key.name === "up" || key.name === "down") return 1;
  return Math.max(1, rows - 1);
}

function handleEditorKey(
  key: KeyEvent,
  setInput: (input: string) => void,
  currentInput: string,
): void {
  if (key.name === "backspace" || key.name === "delete") {
    setInput(currentInput.slice(0, -1));
    return;
  }
  if (key.name === "return") {
    setInput(`${currentInput}\n`);
    return;
  }
  if (key.ctrl || key.meta) return;
  if (!key.sequence || key.sequence.length !== 1) return;
  if (key.sequence < " ") return;
  setInput(`${currentInput}${key.sequence}`);
}

function createLayout(width: number, height: number, provider: string, model: string): Layout {
  const normalizedWidth = Math.max(48, Math.min(width || 100, 118));
  const normalizedHeight = Math.max(18, height || 30);
  const compact = normalizedWidth < 92 || normalizedHeight < 28;
  const warningRows = compact ? 1 : 2;
  const rootPaddingRows = compact ? 0 : 2;
  const interSectionGaps = compact ? 0 : 4;
  const headerRows = 1;
  const actionRows = compact ? 2 : 1;
  const contextRows = compact ? 1 : 3;
  const panelChromeRows = 6;
  const resultInternalRows = warningRows + 2;
  const footerReserveRows = actionRows + 1;
  const fixedRows =
    rootPaddingRows +
    interSectionGaps +
    headerRows +
    footerReserveRows +
    contextRows +
    panelChromeRows * 2 +
    resultInternalRows;
  const contentRows = Math.max(6, normalizedHeight - fixedRows);
  const editorRows = Math.max(2, Math.min(compact ? 3 : 8, Math.floor(contentRows * 0.35)));
  const resultRows = Math.max(2, contentRows - editorRows - (compact ? 3 : 0));
  const badgeRow = compact ? 13 : 14;
  const pickerTop = compact ? 2 : 4;
  const pickerLeft = compact ? 1 : 4;
  const pickerWidth = compact ? 62 : 74;
  const labels = [
    ["profile", "profil auto ^P"],
    ["level", "niveau standard ^L"],
    ["provider", `provider ${provider} ^I`],
    ["model", `modèle ${shortModel(model)} ^O`],
  ] as const;
  let cursor = compact ? 2 : 4;
  const badgeZones = labels.map(([id, label]) => {
    const start = cursor;
    const end = cursor + label.length + 3;
    cursor = end + 2;
    return { id, row: badgeRow, start, end };
  });
  return {
    width: normalizedWidth,
    height: normalizedHeight,
    textWidth: Math.max(24, normalizedWidth - (compact ? 6 : 10)),
    compact,
    editorRows,
    resultRows,
    warningRows,
    actionRows,
    badgeRow,
    badgeZones,
    pickerTop,
    pickerLeft,
    pickerWidth,
  };
}

function pickerOptionIndexAt(layout: Layout, row: number, optionCount: number): number | null {
  const firstOptionRow = layout.pickerTop + 4;
  const relative = row - firstOptionRow;
  if (relative < 0) return null;
  const index = Math.floor(relative / 2);
  if (relative % 2 !== 0 || index >= optionCount) return null;
  return index;
}

async function main(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  });
  createRoot(renderer).render(<App />);
}

void main();
