import { useT } from "../shared/i18n.js";
import { SHORTCUT_PRESETS } from "@/apps/desktop/shared/ipc-contract.js";
import { formatAccelerator } from "../shared/shortcut-labels.js";

/** Le choix de langue tel qu'il est enregistré : « auto » en fait partie. */
export type UiLocalePreference = "auto" | "en" | "fr";

export interface PreferencesTabProps {
  chosen: { capture?: string; input?: string };
  onChoose(intent: "capture" | "input", accelerator: string): void;
  captureShortcut: string;
  inputShortcut: string;
  rejectedShortcuts: string[];
  hasNoShortcut: boolean;
  permissionDetail: string;
  canReplace: boolean | null;
  onAskPermissions: () => void;
  uiLocale: UiLocalePreference;
  onChooseLanguage(preference: UiLocalePreference): void;
}

/** Onglet Réglages (R4) : raccourcis et conflits (§5.5), langue, permissions. */
export function PreferencesTab(props: Readonly<PreferencesTabProps>): React.JSX.Element {
  const t = useT();
  return (
    <>
      <ShortcutRow
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
        title={t("settings.inputShortcut")}
        detail={t("settings.inputShortcutDetail")}
        active={props.inputShortcut}
        presets={SHORTCUT_PRESETS.input}
        chosen={props.chosen.input ?? ""}
        onChoose={(accelerator) => {
          props.onChoose("input", accelerator);
        }}
      />
      <p className="settings-note muted">{t("settings.shortcutRestart")}</p>
      {props.rejectedShortcuts.length > 0 && (
        <div className="settings-warning" role="alert">
          ! {t("settings.shortcutsTaken", { list: props.rejectedShortcuts.join(", ") })}
        </div>
      )}
      {props.hasNoShortcut && (
        <div className="settings-warning" role="alert">
          ! {t("settings.shortcutsNone")}
        </div>
      )}
      {/* Après les avertissements de raccourcis, pas au milieu : une alerte
          séparée de la ligne qu'elle concerne ne se rattache plus à rien. */}
      <LanguageRow chosen={props.uiLocale} onChoose={props.onChooseLanguage} />
      <div className="settings-row">
        <div>
          <div className="settings-row-title">{t("settings.macosPermissions")}</div>
          <div className="settings-row-detail">{props.permissionDetail}</div>
        </div>
        {props.canReplace === false && (
          <button type="button" className="chip chip-active" onClick={props.onAskPermissions}>
            {t("settings.allow")}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * La langue de l'interface.
 *
 * Le choix est écrit tout de suite dans la configuration, mais l'application
 * ne change pas de langue en cours de route : le menu de la barre et les
 * titres de fenêtre sont posés au démarrage et ne peuvent plus être
 * réétiquetés. Montrer une moitié traduite serait pire que d'attendre le
 * prochain lancement, ce que la ligne annonce.
 */
function LanguageRow(
  props: Readonly<{
    chosen: UiLocalePreference;
    onChoose(preference: UiLocalePreference): void;
  }>,
): React.JSX.Element {
  const t = useT();
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-title">{t("settings.language")}</div>
        <div className="settings-row-detail">{t("settings.languageDetail")}</div>
      </div>
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
    </div>
  );
}

interface ShortcutRowProps {
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
 * The two are shown separately on purpose. "Automatique" does not mean "none":
 * it means the application walks its own list, and the combination that came
 * out of it is the one displayed beside it. Merging them would hide the case
 * where a preferred choice was refused and something else is answering.
 */
function ShortcutRow(props: Readonly<ShortcutRowProps>): React.JSX.Element {
  const t = useT();
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
    <div className="settings-row">
      <div>
        <div className="settings-row-title">{props.title}</div>
        <div className="settings-row-detail">{props.detail}</div>
        {overridden && (
          <div className="settings-row-detail shortcut-overridden">
            {t("settings.shortcutUnavailable", { accelerator: formatAccelerator(props.active, t) })}
          </div>
        )}
      </div>
      <div className="shortcut-control">
        <kbd>{formatAccelerator(props.active, t)}</kbd>
        <select
          className="settings-select"
          value={props.chosen}
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
      </div>
    </div>
  );
}
