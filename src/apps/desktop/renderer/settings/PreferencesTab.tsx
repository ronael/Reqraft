import {
  Compass,
  Languages,
  PanelTop,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SquarePen,
  TextSelect,
  type LucideIcon,
} from "lucide-react";
import { useT } from "../shared/i18n.js";
import { SHORTCUT_PRESETS, type ShortcutIntent } from "@/apps/desktop/shared/ipc-contract.js";
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
