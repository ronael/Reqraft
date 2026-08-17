import { useCallback, useEffect, useState } from "react";
import {
  REPROMPT_LEVEL_IDS,
  type DoctorReport,
  type PermissionsState,
  type ProfileSummary,
  type ProviderStatus,
  type SafeConfig,
  type ShortcutStateInfo,
} from "../../shared/ipc-contract.js";

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
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutStateInfo | null>(null);
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);

  useEffect(() => {
    void window.reqraft.readConfig().then(setConfig);
    void window.reqraft.providersStatus().then(setProviders);
    void window.reqraft.listProfiles().then(setProfiles);
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
          <>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={
                  profile.id === config.defaultProfile
                    ? "settings-row settings-row-button settings-row-active"
                    : "settings-row settings-row-button"
                }
                onClick={() => {
                  patchConfig({ defaultProfile: profile.id });
                }}
              >
                <div>
                  <div className="settings-row-title">{profile.name}</div>
                  <div className="settings-row-detail">{profile.description}</div>
                </div>
                {profile.id === config.defaultProfile && <span className="verdict-good">✓</span>}
              </button>
            ))}
          </>
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
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Reformuler la sélection</div>
          <div className="settings-row-detail">Capsule ancrée au curseur</div>
        </div>
        <kbd>{props.captureShortcut}</kbd>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">Ouvrir sans sélection</div>
          <div className="settings-row-detail">Capsule centrée, saisie libre</div>
        </div>
        <kbd>{props.inputShortcut}</kbd>
      </div>
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
