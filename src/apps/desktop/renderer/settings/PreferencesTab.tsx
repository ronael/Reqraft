import { useId, useState } from "react";
import {
  Compass,
  Gauge,
  Globe,
  Hash,
  Languages,
  PanelTop,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SquarePen,
  TextSelect,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useT } from "../shared/i18n.js";
import {
  FIDELITY_MODE_IDS,
  SHORTCUT_PRESETS,
  type ConfigWriteRequest,
  type DesktopFidelityMode,
  type ShortcutIntent,
} from "@/apps/desktop/shared/ipc-contract.js";
import { formatAccelerator } from "../shared/shortcut-labels.js";
import { Button } from "../shared/Button.js";
import { InlineMessage } from "../shared/InlineMessage.js";

/** Le choix de langue tel qu'il est enregistré : « auto » en fait partie. */
export type UiLocalePreference = "auto" | "en" | "fr";

export interface PreferencesTabProps {
  chosen: Partial<Record<ShortcutIntent, string>>;
  onChoose(intent: ShortcutIntent, accelerator: string): void;
  onResetShortcuts(): void;
  onRetestShortcuts(): void;
  captureShortcut: string;
  inputShortcut: string;
  popoverShortcut: string;
  rejectedShortcuts: string[];
  conflictingShortcuts: string[];
  shortcutsSuspended: boolean;
  hasNoShortcut: boolean;
  permissionDetail: string;
  canReplace: boolean | null;
  onAskPermissions: () => void;
  uiLocale: UiLocalePreference;
  onChooseLanguage(preference: UiLocalePreference): void;
  onOpenWelcomeTour(): void;
  timeoutMs: number;
  maxOutputTokens?: number;
  fidelityMode: DesktopFidelityMode;
  outputLanguage: string;
  onPatchConfig(patch: ConfigWriteRequest): void;
}

/** Onglet Réglages (R4) : raccourcis et conflits (§5.5), langue, permissions. */
export function PreferencesTab(props: Readonly<PreferencesTabProps>): React.JSX.Element {
  const t = useT();
  return (
    <>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.preferences.shortcutsGroup")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <ShortcutRow
              icon={TextSelect}
              title={t("settings.captureShortcut")}
              detail={t("settings.captureShortcutDetail")}
              active={props.captureShortcut}
              presets={SHORTCUT_PRESETS.capture}
              chosen={props.chosen.capture ?? ""}
              onChoose={(accelerator) => {
                props.onChoose("capture", accelerator);
              }}
            />
            <ShortcutRow
              icon={SquarePen}
              title={t("settings.inputShortcut")}
              detail={t("settings.inputShortcutDetail")}
              active={props.inputShortcut}
              presets={SHORTCUT_PRESETS.input}
              chosen={props.chosen.input ?? ""}
              onChoose={(accelerator) => {
                props.onChoose("input", accelerator);
              }}
            />
            <ShortcutRow
              icon={PanelTop}
              title={t("settings.popoverShortcut")}
              detail={t("settings.popoverShortcutDetail")}
              active={props.popoverShortcut}
              presets={SHORTCUT_PRESETS.popover}
              chosen={props.chosen.popover ?? ""}
              onChoose={(accelerator) => {
                props.onChoose("popover", accelerator);
              }}
            />
          </div>
          <div className="settings-group-foot settings-group-foot-split">
            <p className="settings-note muted">{t("settings.shortcutRestart")}</p>
            <div className="settings-actions shortcut-actions">
              <Button variant="neutral" onClick={props.onResetShortcuts}>
                <RotateCcw size={13} aria-hidden /> {t("settings.shortcutsReset")}
              </Button>
              <Button variant="neutral" onClick={props.onRetestShortcuts}>
                <RefreshCw size={13} aria-hidden /> {t("settings.shortcutsRetest")}
              </Button>
            </div>
          </div>
        </div>

        <ShortcutMessages
          rejected={props.rejectedShortcuts}
          conflicting={props.conflictingShortcuts}
          suspended={props.shortcutsSuspended}
          hasNoShortcut={props.hasNoShortcut}
        />
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.preferences.interfaceGroup")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <LanguageRow chosen={props.uiLocale} onChoose={props.onChooseLanguage} />
            <div className="settings-group-row">
              <span className="settings-row-icon">
                <Compass size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.welcomeTour")}</span>
                <span className="settings-row-detail">{t("settings.welcomeTourDetail")}</span>
              </span>
              <span className="settings-row-control">
                <Button variant="neutral" onClick={props.onOpenWelcomeTour}>
                  <RotateCcw size={13} aria-hidden /> {t("settings.welcomeTourReplay")}
                </Button>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.preferences.generationGroup")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <FidelityRow
              chosen={props.fidelityMode}
              onChoose={(fidelityMode) => {
                props.onPatchConfig({ fidelityMode });
              }}
            />
            <OutputLanguageRow
              key={`output-language:${props.outputLanguage}`}
              value={props.outputLanguage}
              onCommit={(outputLanguage) => {
                props.onPatchConfig({ outputLanguage });
              }}
            />
            <TimeoutRow
              key={`timeout:${String(props.timeoutMs)}`}
              timeoutMs={props.timeoutMs}
              onCommit={(timeoutMs) => {
                props.onPatchConfig({ timeoutMs });
              }}
            />
            <MaxOutputTokensRow
              key={`max-output-tokens:${String(props.maxOutputTokens ?? "auto")}`}
              value={props.maxOutputTokens}
              onCommit={(maxOutputTokens) => {
                props.onPatchConfig({ maxOutputTokens });
              }}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.preferences.systemGroup")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <div className="settings-group-row">
              <span className="settings-row-icon">
                <ShieldCheck size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.macosPermissions")}</span>
                <span className="settings-row-detail">{props.permissionDetail}</span>
              </span>
              <span className="settings-row-control">
                <PermissionControl
                  canReplace={props.canReplace}
                  onAskPermissions={props.onAskPermissions}
                />
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PermissionControl(
  props: Readonly<{ canReplace: boolean | null; onAskPermissions: () => void }>,
): React.JSX.Element {
  const t = useT();
  if (props.canReplace === null) {
    return <span className="settings-state">{t("settings.permissionsChecking")}</span>;
  }
  if (props.canReplace) {
    return (
      <span className="settings-state settings-state-ok">
        <ShieldCheck size={13} aria-hidden />
        {t("settings.permissionsOk")}
      </span>
    );
  }
  return <Button onClick={props.onAskPermissions}>{t("settings.allow")}</Button>;
}

function ShortcutMessages(
  props: Readonly<{
    rejected: string[];
    conflicting: string[];
    suspended: boolean;
    hasNoShortcut: boolean;
  }>,
): React.JSX.Element | null {
  const t = useT();
  const nothingToSay =
    props.rejected.length === 0 &&
    props.conflicting.length === 0 &&
    !props.suspended &&
    !props.hasNoShortcut;
  if (nothingToSay) return null;

  return (
    <div className="settings-messages">
      {props.rejected.length > 0 && (
        <InlineMessage tone="warning" role="alert">
          {t("settings.shortcutsTaken", { list: props.rejected.join(", ") })}
        </InlineMessage>
      )}
      {props.hasNoShortcut && (
        <InlineMessage tone="error" role="alert">
          {t("settings.shortcutsNone")}
        </InlineMessage>
      )}
      {props.conflicting.length > 0 && (
        <InlineMessage tone="warning" role="alert">
          {t("settings.shortcutsConflicting", { list: props.conflicting.join(", ") })}
        </InlineMessage>
      )}
      {props.suspended && (
        <InlineMessage tone="info">{t("settings.shortcutsSuspended")}</InlineMessage>
      )}
    </div>
  );
}

function LanguageRow(
  props: Readonly<{
    chosen: UiLocalePreference;
    onChoose(preference: UiLocalePreference): void;
  }>,
): React.JSX.Element {
  const t = useT();
  return (
    <div className="settings-group-row">
      <span className="settings-row-icon">
        <Languages size={18} strokeWidth={1.7} aria-hidden />
      </span>
      <span className="settings-group-copy">
        <span className="settings-row-title">{t("settings.language")}</span>
        <span className="settings-row-detail">{t("settings.languageDetail")}</span>
      </span>
      <span className="settings-row-control">
        <select
          className="settings-select"
          value={props.chosen}
          aria-label={t("settings.language")}
          onChange={(event) => {
            props.onChoose(event.target.value as UiLocalePreference);
          }}
        >
          <option value="auto">{t("settings.languageAuto")}</option>
          <option value="en">{t("settings.languageEn")}</option>
          <option value="fr">{t("settings.languageFr")}</option>
        </select>
      </span>
    </div>
  );
}

function EditableRow(
  props: Readonly<{
    icon: LucideIcon;
    title: string;
    detail: string;
    controlId: string;
    errorId: string;
    error: string | null;
    controlClassName?: string;
    children: React.ReactNode;
  }>,
): React.JSX.Element {
  const Icon = props.icon;
  return (
    <div className="settings-group-row">
      <span className="settings-row-icon">
        <Icon size={18} strokeWidth={1.7} aria-hidden />
      </span>
      <span className="settings-group-copy">
        <label className="settings-row-title" htmlFor={props.controlId}>
          {props.title}
        </label>
        <span className="settings-row-detail">{props.detail}</span>
        {props.error !== null && (
          <span className="settings-row-error" id={props.errorId} role="alert">
            {props.error}
          </span>
        )}
      </span>
      <span className={["settings-row-control", props.controlClassName].filter(Boolean).join(" ")}>
        {props.children}
      </span>
    </div>
  );
}

function FidelityRow(
  props: Readonly<{
    chosen: DesktopFidelityMode;
    onChoose(mode: DesktopFidelityMode): void;
  }>,
): React.JSX.Element {
  const t = useT();
  const controlId = useId();
  const labels: Record<DesktopFidelityMode, string> = {
    strict: t("settings.fidelityStrict"),
    balanced: t("settings.fidelityBalanced"),
    permissive: t("settings.fidelityPermissive"),
  };
  return (
    <EditableRow
      icon={Gauge}
      title={t("settings.fidelity")}
      detail={t("settings.fidelityDetail")}
      controlId={controlId}
      errorId={`${controlId}-error`}
      error={null}
    >
      <select
        id={controlId}
        className="settings-select"
        value={props.chosen}
        onChange={(event) => {
          props.onChoose(event.target.value as DesktopFidelityMode);
        }}
      >
        {FIDELITY_MODE_IDS.map((mode) => (
          <option key={mode} value={mode}>
            {labels[mode]}
          </option>
        ))}
      </select>
    </EditableRow>
  );
}

function TimeoutRow(
  props: Readonly<{ timeoutMs: number; onCommit(timeoutMs: number): void }>,
): React.JSX.Element {
  const t = useT();
  const controlId = useId();
  const errorId = `${controlId}-error`;
  const [draft, setDraft] = useState(() => String(props.timeoutMs / 1000));
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    const seconds = Number(draft.trim().replace(",", "."));
    const milliseconds = Math.round(seconds * 1000);
    if (draft.trim() === "" || !Number.isFinite(seconds) || milliseconds <= 0) {
      setError(t("settings.timeoutInvalid"));
      return;
    }
    setError(null);
    if (milliseconds !== props.timeoutMs) props.onCommit(milliseconds);
  };

  return (
    <EditableRow
      icon={Timer}
      title={t("settings.timeout")}
      detail={t("settings.timeoutDetail")}
      controlId={controlId}
      errorId={errorId}
      error={error}
    >
      <input
        id={controlId}
        className="settings-input settings-input-compact"
        type="number"
        inputMode="decimal"
        min={1}
        step={1}
        value={draft}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="settings-row-detail">{t("settings.timeoutUnit")}</span>
    </EditableRow>
  );
}

function MaxOutputTokensRow(
  props: Readonly<{ value?: number; onCommit(value: number | undefined): void }>,
): React.JSX.Element {
  const t = useT();
  const controlId = useId();
  const errorId = `${controlId}-error`;
  const [draft, setDraft] = useState(() => (props.value === undefined ? "" : String(props.value)));
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    const raw = draft.trim();
    if (raw === "") {
      setError(null);
      if (props.value !== undefined) props.onCommit(undefined);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError(t("settings.maxOutputTokensInvalid"));
      return;
    }
    setError(null);
    if (parsed !== props.value) props.onCommit(parsed);
  };

  return (
    <EditableRow
      icon={Hash}
      title={t("settings.maxOutputTokens")}
      detail={t("settings.maxOutputTokensDetail")}
      controlId={controlId}
      errorId={errorId}
      error={error}
    >
      <input
        id={controlId}
        className="settings-input settings-input-compact"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={draft}
        placeholder={t("settings.maxOutputTokensAuto")}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </EditableRow>
  );
}

function OutputLanguageRow(
  props: Readonly<{ value: string; onCommit(value: string): void }>,
): React.JSX.Element {
  const t = useT();
  const controlId = useId();
  const customId = `${controlId}-custom`;
  const errorId = `${controlId}-error`;
  const [custom, setCustom] = useState(() => props.value !== "auto");
  const [draft, setDraft] = useState(() => (props.value === "auto" ? "" : props.value));
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    const value = draft.trim();
    if (value === "") {
      setError(t("settings.outputLanguageInvalid"));
      return;
    }
    setError(null);
    if (value !== props.value) props.onCommit(value);
  };

  return (
    <EditableRow
      icon={Globe}
      title={t("settings.outputLanguage")}
      detail={t("settings.outputLanguageDetail")}
      controlId={controlId}
      errorId={errorId}
      error={error}
      controlClassName="settings-row-control-language"
    >
      <select
        id={controlId}
        className="settings-select"
        value={custom ? "custom" : "auto"}
        onChange={(event) => {
          if (event.target.value === "custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          setError(null);
          if (props.value !== "auto") props.onCommit("auto");
        }}
      >
        <option value="auto">{t("settings.outputLanguageAuto")}</option>
        <option value="custom">{t("settings.outputLanguageCustom")}</option>
      </select>
      {custom && (
        <input
          id={customId}
          className="settings-input"
          value={draft}
          aria-label={t("settings.outputLanguageCustomLabel")}
          placeholder={t("settings.outputLanguagePlaceholder")}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      )}
    </EditableRow>
  );
}

interface ShortcutRowProps {
  icon: LucideIcon;
  title: string;
  detail: string;
  /** The accelerator actually in force right now, fallback included, raw. */
  active: string;
  presets: readonly string[];
  chosen: string;
  onChoose(accelerator: string): void;
}

/**
 * One shortcut: what is in force, and what may be chosen instead.
 *
 * The two values are shown separately on purpose. "Automatique" does not mean "none":
 * it means the application walks its own list, and the combination that came
 * out of it is the one displayed beside it. Merging them would hide the case
 * where a preferred choice was refused and something else is answering.
 */
function ShortcutRow(props: Readonly<ShortcutRowProps>): React.JSX.Element {
  const t = useT();
  const Icon = props.icon;
  // Raw against raw. Comparing formatted labels made this fire whenever the two
  // formatters disagreed, which is a bug report about a shortcut that works.
  const overridden = props.chosen !== "" && props.chosen !== props.active;

  // A value stored before the offered list changed still belongs in the list:
  // without it the select silently shows its first option, which is a choice
  // the user never made.
  const options = props.presets.includes(props.chosen)
    ? props.presets
    : [...props.presets, ...(props.chosen === "" ? [] : [props.chosen])];

  return (
    <div className="settings-group-row">
      <span className="settings-row-icon">
        <Icon size={18} strokeWidth={1.7} aria-hidden />
      </span>
      <span className="settings-group-copy">
        <span className="settings-row-title">{props.title}</span>
        <span className="settings-row-detail">{props.detail}</span>
        {overridden && (
          <span className="settings-row-detail shortcut-overridden">
            {t("settings.shortcutUnavailable", { accelerator: formatAccelerator(props.active, t) })}
          </span>
        )}
      </span>
      <span className="settings-row-control shortcut-control">
        <kbd>{formatAccelerator(props.active, t)}</kbd>
        <select
          className="settings-select"
          value={props.chosen}
          aria-label={props.title}
          onChange={(event) => {
            props.onChoose(event.target.value);
          }}
        >
          <option value="">{t("settings.automatic")}</option>
          {options.map((accelerator) => (
            <option key={accelerator} value={accelerator}>
              {formatAccelerator(accelerator, t)}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
