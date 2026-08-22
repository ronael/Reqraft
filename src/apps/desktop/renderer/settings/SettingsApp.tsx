import { useCallback, useEffect, useState } from "react";
import {
  REPROMPT_LEVEL_IDS,
  SHORTCUT_PRESETS,
  type DoctorReport,
  type PermissionsState,
  type ProviderStatus,
  type SafeConfig,
  type ShortcutStateInfo,
} from "@/apps/desktop/shared/ipc-contract.js";

import { ProfilesTab } from "./ProfilesTab.js";

const TABS = ["Raccourcis", "Providers", "Modèles", "Profils", "Diagnostic"] as const;
type Tab = (typeof TABS)[number];

/**
 * Settings surface (DESKTOP.md lot 5): five horizontal tabs, no sidebar.
 * Parity with `rp config`, `rp doctor`, `rp auth status` — everything goes
 * through the IPC contract; no API key is ever displayed, only
 * configured/absent states (§2.2).
 */
export function SettingsApp(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("Raccourcis");
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutStateInfo | null>(null);
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);

  useEffect(() => {
    void window.reqraft.readConfig().then(setConfig);
    void window.reqraft.providersStatus().then(setProviders);
    void window.reqraft.shortcutsState().then(setShortcuts);
    void window.reqraft.permissionsState().then(setPermissions);
  }, []);

  const runDoctor = useCallback(() => {
    setDoctorRunning(true);
    void window.reqraft
      .runDoctor()
      .then(setDoctor)
      .finally(() => {
        setDoctorRunning(false);
      });
  }, []);

  const patchConfig = useCallback((patch: Parameters<typeof window.reqraft.writeConfig>[0]) => {
    void window.reqraft.writeConfig(patch).then(setConfig);
  }, []);

  const askPermissions = useCallback(() => {
    void window.reqraft
      .requestPermissions()
      .then(() => window.reqraft.permissionsState())
      .then(setPermissions);
  }, []);

  const captureShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "capture")?.label ?? "—";
  const inputShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "input")?.label ?? "—";
  const rejectedShortcuts = shortcuts?.rejected ?? [];
  const hasNoShortcut = shortcuts !== null && shortcuts.registered.length === 0;

  function permissionDetail(): string {
    if (permissions?.reason !== undefined) {
      return permissions.reason;
    }
    if (permissions?.canReplace === true) {
      return "Accessibilité et Automatisation accordées.";
    }
    return "Requises pour la capture et le remplacement.";
  }

  return (
    <main className="settings">
      <nav className="settings-tabs">
        {TABS.map((label) => (
          <button
            key={label}
            type="button"
            className={label === tab ? "settings-tab settings-tab-active" : "settings-tab"}
            onClick={() => {
              setTab(label);
              if (label === "Diagnostic" && doctor === null && !doctorRunning) {
                runDoctor();
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="settings-panel">
        {tab === "Raccourcis" && (
          <RaccourcisTab
            captureShortcut={captureShortcut}
            inputShortcut={inputShortcut}
            rejectedShortcuts={rejectedShortcuts}
            hasNoShortcut={hasNoShortcut}
            permissionDetail={permissionDetail()}
            canReplace={permissions?.canReplace ?? null}
            onAskPermissions={askPermissions}
            chosen={config?.desktopShortcuts ?? {}}
            onChoose={(intent, accelerator) => {
              patchConfig({
                desktopShortcuts: {
                  ...(config?.desktopShortcuts ?? {}),
                  [intent]: accelerator === "" ? undefined : accelerator,
                },
              });
            }}
          />
        )}

        {tab === "Providers" && (
          <>
            {providers.map((provider) => (
              <div key={provider.id} className="settings-row">
                <div>
                  <div className="settings-row-title">{provider.id}</div>
                  <div className="settings-row-detail">
                    {provider.configured ? `configuré · ${provider.source}` : "non configuré"}
                  </div>
                </div>
                <span className={provider.configured ? "verdict-good" : "muted"}>
                  {provider.configured ? "✓" : "—"}
                </span>
              </div>
            ))}
            <p className="muted settings-note">
              Les clés se configurent par variable d’environnement ou par <code>rp auth</code> en
              CLI. Elles ne sont jamais affichées ici.
            </p>
          </>
        )}

        {tab === "Modèles" && config !== null && (
          <>
            <div className="settings-row">
              <div className="settings-row-title">Provider par défaut</div>
              <select
                className="settings-select"
                value={config.defaultProvider}
                onChange={(event) => {
                  patchConfig({
                    defaultProvider: event.target.value as SafeConfig["defaultProvider"],
                  });
                }}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-row-title">Modèle par défaut</div>
              <input
                className="settings-input"
                defaultValue={config.defaultModel}
                onBlur={(event) => {
                  if (event.target.value !== config.defaultModel) {
                    patchConfig({ defaultModel: event.target.value });
                  }
                }}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-title">Niveau par défaut</div>
              <select
                className="settings-select"
                value={config.defaultLevel}
                onChange={(event) => {
                  patchConfig({ defaultLevel: event.target.value as SafeConfig["defaultLevel"] });
                }}
              >
                {REPROMPT_LEVEL_IDS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {tab === "Profils" && config !== null && (
          <ProfilesTab
            config={config}
            onSelectDefault={(id) => {
              patchConfig({ defaultProfile: id });
            }}
          />
        )}

        {tab === "Diagnostic" && (
          <>
            {doctorRunning && <p className="muted">Diagnostic en cours…</p>}
            {doctor?.checks.map((check) => (
              <div key={check.id} className="settings-row">
                <div>
                  <div className="settings-row-title">{check.id}</div>
                  {check.detail !== undefined && (
                    <div className="settings-row-detail">{check.detail}</div>
                  )}
                </div>
                <span className={check.ok ? "verdict-good" : "verdict-risky"}>
                  {check.ok ? "OK" : "×"}
                </span>
              </div>
            ))}
            <div className="settings-actions">
              <button type="button" className="chip" onClick={runDoctor} disabled={doctorRunning}>
                Relancer le diagnostic
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

interface RaccourcisTabProps {
  chosen: { capture?: string; input?: string };
  onChoose(intent: "capture" | "input", accelerator: string): void;
  captureShortcut: string;
  inputShortcut: string;
  rejectedShortcuts: string[];
  hasNoShortcut: boolean;
  permissionDetail: string;
  canReplace: boolean | null;
  onAskPermissions: () => void;
}

/** Onglet Raccourcis : raccourcis actifs, conflits visibles (§5.5), permissions. */
function RaccourcisTab(props: Readonly<RaccourcisTabProps>): React.JSX.Element {
  return (
    <>
      <ShortcutRow
        title="Reformuler la sélection"
        detail="Capsule ancrée au curseur"
        active={props.captureShortcut}
        presets={SHORTCUT_PRESETS.capture}
        chosen={props.chosen.capture ?? ""}
        onChoose={(accelerator) => {
          props.onChoose("capture", accelerator);
        }}
      />
      <ShortcutRow
        title="Ouvrir sans sélection"
        detail="Capsule centrée, saisie libre"
        active={props.inputShortcut}
        presets={SHORTCUT_PRESETS.input}
        chosen={props.chosen.input ?? ""}
        onChoose={(accelerator) => {
          props.onChoose("input", accelerator);
        }}
      />
      <p className="settings-note muted">
        Un changement prend effet au prochain démarrage : un raccourci global se réserve auprès du
        système au lancement.
      </p>
      {props.rejectedShortcuts.length > 0 && (
        <div className="settings-warning" role="alert">
          ! Raccourcis déjà pris par une autre application : {props.rejectedShortcuts.join(", ")}.
          Un repli a été enregistré — modifie le raccourci concurrent pour utiliser ton choix
          préféré.
        </div>
      )}
      {props.hasNoShortcut && (
        <div className="settings-warning" role="alert">
          ! Aucun raccourci global disponible. Reqraft ne peut pas se déclencher au clavier — libère
          un raccourci puis relance l’application.
        </div>
      )}
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Permissions macOS</div>
          <div className="settings-row-detail">{props.permissionDetail}</div>
        </div>
        {props.canReplace === false && (
          <button type="button" className="chip chip-active" onClick={props.onAskPermissions}>
            Autoriser…
          </button>
        )}
      </div>
    </>
  );
}

interface ShortcutRowProps {
  title: string;
  detail: string;
  /** The combination actually in force right now, fallback included. */
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
  const overridden = props.chosen !== "" && prettyLabel(props.chosen) !== props.active;

  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-title">{props.title}</div>
        <div className="settings-row-detail">{props.detail}</div>
        {overridden && (
          <div className="settings-row-detail shortcut-overridden">
            Choix non disponible : un repli est actif.
          </div>
        )}
      </div>
      <div className="shortcut-control">
        <kbd>{props.active}</kbd>
        <select
          className="settings-select"
          value={props.chosen}
          onChange={(event) => {
            props.onChoose(event.target.value);
          }}
        >
          <option value="">Automatique</option>
          {props.presets.map((accelerator) => (
            <option key={accelerator} value={accelerator}>
              {prettyLabel(accelerator)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * macOS symbols for an accelerator.
 *
 * Duplicated from `main/shortcuts.ts` rather than imported: the renderer may
 * not reach into the main process, and this is four replacements over a string
 * the contract already fixes.
 */
function prettyLabel(accelerator: string): string {
  return accelerator
    .replace("Command", "⌘")
    .replace("Control", "⌃")
    .replace("Alt", "⌥")
    .replace("Shift", "⇧")
    .replaceAll("+", "")
    .replace("Space", "Espace");
}
