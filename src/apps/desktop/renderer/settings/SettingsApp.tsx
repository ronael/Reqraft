import { type ComponentType, useCallback, useEffect, useState } from "react";
import { Cpu, Plus, SlidersHorizontal, Stethoscope, UserRound, Waypoints } from "lucide-react";
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

const TABS = ["Profils", "Providers", "Modèles", "Réglages", "Diagnostic"] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<
  Tab,
  {
    icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    title: string;
    detail: string;
  }
> = {
  Profils: {
    icon: UserRound,
    title: "Profils",
    detail: "Style de reformulation et profils locaux.",
  },
  Providers: {
    icon: Waypoints,
    title: "Providers",
    detail: "Vos clés et vos endpoints, sans jamais afficher une clé.",
  },
  Modèles: {
    icon: Cpu,
    title: "Modèles",
    detail: "Provider, modèle et niveau utilisés par défaut.",
  },
  Réglages: {
    icon: SlidersHorizontal,
    title: "Réglages",
    detail: "Raccourcis globaux, permissions et préférences desktop.",
  },
  Diagnostic: {
    icon: Stethoscope,
    title: "Diagnostic",
    detail: "Vérifications locales et rapport sans secret.",
  },
};

/**
 * Settings surface (DESKTOP.md lot 5): five horizontal tabs, no sidebar.
 * Parity with `rp config`, `rp doctor`, `rp auth status` — everything goes
 * through the IPC contract; no API key is ever displayed, only
 * configured/absent states (§2.2).
 */
export function SettingsApp(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("Profils");
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

  // The raw accelerator, not the main process's label: the row compares it to
  // the configured choice, and comparing two strings produced by two different
  // formatters is a false mismatch waiting to happen.
  const captureShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "capture")?.accelerator ?? "";
  const inputShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "input")?.accelerator ?? "";
  const rejectedShortcuts = shortcuts?.rejected ?? [];
  const hasNoShortcut = shortcuts !== null && shortcuts.registered.length === 0;
  const configuredProviderCount = providers.filter((provider) => provider.configured).length;
  const activeTab = TAB_META[tab];

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
      <div className="settings-titlebar">
        <div className="settings-titlebar-spacer" aria-hidden />
        <div className="settings-title">Reqraft</div>
        <span className="settings-ready">prêt</span>
      </div>

      <div className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-brand">
            <div>
              <span className="settings-brand-name">reqraft</span>
              <span className="settings-brand-version">0.4.0</span>
            </div>
            <p>Shape the request. Keep the intent.</p>
          </div>

          <nav className="settings-nav" aria-label="Réglages Reqraft">
            {TABS.map((label) => (
              <SettingsNavItem
                key={label}
                active={label === tab}
                label={label}
                meta={TAB_META[label]}
                onClick={() => {
                  setTab(label);
                  if (label === "Diagnostic" && doctor === null && !doctorRunning) {
                    runDoctor();
                  }
                }}
              />
            ))}
          </nav>

          <ContextPanel config={config} configuredProviderCount={configuredProviderCount} />
        </aside>

        <section className="settings-content">
          <header className="settings-screen-header">
            <div>
              <h1>{activeTab.title}</h1>
              <p>{activeTab.detail}</p>
            </div>
          </header>

          <div className="settings-panel">
            {tab === "Réglages" && (
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

            {tab === "Providers" && config !== null && (
              <ProvidersTab
                providers={providers}
                config={config}
                onChanged={(response) => {
                  setConfig(response.config);
                  setProviders(response.providers);
                }}
                onProvidersChanged={setProviders}
              />
            )}

            {tab === "Modèles" && config !== null && (
              <ModelsTab config={config} providers={providers} onPatchConfig={patchConfig} />
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
              <DiagnosticTab doctor={doctor} running={doctorRunning} onRunDoctor={runDoctor} />
            )}
          </div>
        </section>
      </div>

      <footer className="settings-statusbar">
        <span>
          {config === null
            ? "configuration en lecture"
            : `${config.defaultProvider} · ${config.defaultModel}`}
        </span>
        <span>Local-first · aucun prompt stocké</span>
      </footer>
    </main>
  );
}

interface SettingsNavItemProps {
  active: boolean;
  label: Tab;
  meta: (typeof TAB_META)[Tab];
  onClick(): void;
}

function SettingsNavItem({
  active,
  label,
  meta,
  onClick,
}: Readonly<SettingsNavItemProps>): React.JSX.Element {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      className={active ? "settings-nav-item settings-nav-item-active" : "settings-nav-item"}
      onClick={onClick}
    >
      <Icon size={15} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

interface ContextPanelProps {
  config: SafeConfig | null;
  configuredProviderCount: number;
}

function ContextPanel({
  config,
  configuredProviderCount,
}: Readonly<ContextPanelProps>): React.JSX.Element {
  return (
    <>
      <div className="settings-context">
        <div className="settings-context-title">Contexte</div>
        <dl>
          <ContextRow label="provider" value={config?.defaultProvider ?? "—"} />
          <ContextRow label="modèle" value={config?.defaultModel ?? "—"} mono />
          <ContextRow label="profil" value={config?.defaultProfile ?? "—"} />
          <ContextRow label="niveau" value={config?.defaultLevel ?? "—"} />
        </dl>
      </div>
      <div className="settings-sidebar-note">
        {configuredProviderCount} provider configuré
        {configuredProviderCount > 1 ? "s" : ""} · télémétrie désactivée
      </div>
    </>
  );
}

interface ContextRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function ContextRow({ label, value, mono = false }: Readonly<ContextRowProps>): React.JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

interface ProvidersTabProps {
  providers: ProviderStatus[];
  config: SafeConfig;
  onChanged(response: { config: SafeConfig; providers: ProviderStatus[] }): void;
  onProvidersChanged(providers: ProviderStatus[]): void;
}

interface EndpointForm {
  mode: "create" | "update";
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
}

/** What stands between this endpoint form and a working provider. */
export function findEndpointProblem(
  form: EndpointForm,
  takenIds: readonly string[],
): string | undefined {
  const id = form.id.trim();
  if (!id) return "Donnez un identifiant à ce fournisseur.";
  if (!/^[a-z0-9-]+$/.test(id)) {
    return "L'identifiant n'accepte que des minuscules, des chiffres et des tirets.";
  }
  if (form.mode === "create" && takenIds.includes(id)) {
    return "Cet identifiant est déjà pris.";
  }
  const parsed = URL.parse(form.baseUrl.trim());
  if (parsed?.protocol !== "http:" && parsed?.protocol !== "https:") {
    return "L'URL de base doit commencer par http:// ou https://.";
  }
  return undefined;
}

/** How a credential's origin reads, and whether the settings can change it. */
export function describeProviderSource(provider: ProviderStatus): string {
  if (!provider.requiresApiKey) return "Aucune clé nécessaire.";
  switch (provider.source) {
    case "environment":
      return `Clé lue dans ${provider.envName ?? "votre environnement"}.`;
    case "keychain":
      return "Clé enregistrée dans votre trousseau.";
    default:
      return "Aucune clé enregistrée.";
  }
}

function ProvidersTab(props: Readonly<ProvidersTabProps>): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  // Removing a key destroys it: the keychain has no undo, and an API key
  // cannot be read back from the provider once created. Both destructive
  // actions here ask first.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [form, setForm] = useState<EndpointForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoints = Object.entries(props.config.providers ?? {});
  const keyProviders = props.providers.filter((provider) => provider.requiresApiKey);

  function run(action: () => Promise<void>): void {
    setBusy(true);
    setError(null);
    void action()
      .catch((cause: unknown) => {
        setError(messageOfIpc(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  const saveKey = (provider: ProviderStatus): void => {
    run(async () => {
      const response = await window.reqraft.saveCredential({ provider: provider.id, secret });
      // Cleared at once: a key left in a rendered field is a key on screen.
      setSecret("");
      setEditing(null);
      props.onProvidersChanged(response.providers);
    });
  };

  const removeKey = (provider: ProviderStatus): void => {
    run(async () => {
      const response = await window.reqraft.deleteCredential({ provider: provider.id });
      props.onProvidersChanged(response.providers);
    });
  };

  const saveEndpoint = (): void => {
    if (!form) return;
    run(async () => {
      props.onChanged(
        await window.reqraft.saveProvider({
          id: form.id.trim(),
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
          baseUrl: form.baseUrl.trim(),
          ...(form.apiKeyEnv.trim() ? { apiKeyEnv: form.apiKeyEnv.trim() } : {}),
        }),
      );
      setForm(null);
    });
  };

  const problem = form
    ? findEndpointProblem(
        form,
        endpoints.map(([id]) => id),
      )
    : undefined;

  return (
    <>
      <h3 className="settings-subhead">Fournisseurs intégrés</h3>
      <div className="settings-card-list">
        {keyProviders.map((provider) => (
          <BuiltinProviderRow
            key={provider.id}
            provider={provider}
            editing={editing === provider.id}
            confirming={confirming === provider.id}
            secret={secret}
            busy={busy}
            onSecretChange={setSecret}
            onStartEdit={() => {
              setSecret("");
              setConfirming(null);
              setEditing(provider.id);
            }}
            onCancel={() => {
              setSecret("");
              setEditing(null);
            }}
            onSave={() => {
              saveKey(provider);
            }}
            onStartRemove={() => {
              setConfirming(provider.id);
            }}
            onCancelRemove={() => {
              setConfirming(null);
            }}
            onRemove={() => {
              setConfirming(null);
              removeKey(provider);
            }}
          />
        ))}
      </div>

      <h3 className="settings-subhead">Fournisseurs compatibles OpenAI</h3>
      <div className="settings-card-list">
        {endpoints.length === 0 && !form && (
          <p className="settings-note muted">
            Aucun fournisseur personnalisé. Ajoutez-en un pour appeler un serveur local ou une
            passerelle compatible.
          </p>
        )}
        {endpoints.map(([id, endpoint]) => (
          <div key={id} className="settings-row">
            <span>
              <span className="settings-row-title">{endpoint.name ?? id}</span>
              <span className="settings-row-detail mono">{endpoint.baseUrl}</span>
              <span className="settings-row-detail">
                {endpoint.apiKeyEnv === undefined
                  ? "Sans clé."
                  : `Clé lue dans ${endpoint.apiKeyEnv}.`}
              </span>
              {confirming === `endpoint:${id}` && (
                <span className="settings-row-detail provider-confirm">
                  Retirer « {id} » de votre configuration ?
                </span>
              )}
            </span>
            <span className="provider-key-control">
              <button
                type="button"
                className="chip chip-active"
                onClick={() => {
                  setError(null);
                  setForm({
                    mode: "update",
                    id,
                    name: endpoint.name ?? "",
                    baseUrl: endpoint.baseUrl,
                    apiKeyEnv: endpoint.apiKeyEnv ?? "",
                  });
                }}
              >
                Modifier
              </button>
              {confirming === `endpoint:${id}` ? (
                <>
                  <button
                    type="button"
                    className="chip chip-danger"
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null);
                      run(async () => {
                        props.onChanged(await window.reqraft.deleteProvider(id));
                      });
                    }}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setConfirming(null);
                    }}
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="chip"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(`endpoint:${id}`);
                  }}
                >
                  Supprimer
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {form ? (
        <EndpointForm
          form={form}
          problem={problem}
          busy={busy}
          onChange={setForm}
          onCancel={() => {
            setForm(null);
            setError(null);
          }}
          onSave={saveEndpoint}
        />
      ) : (
        <div className="settings-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setError(null);
              setForm({
                mode: "create",
                id: "local",
                name: "",
                baseUrl: "http://localhost:11434/v1",
                apiKeyEnv: "",
              });
            }}
          >
            <Plus size={13} aria-hidden /> Ajouter un fournisseur
          </button>
        </div>
      )}

      {error !== null && (
        <div className="settings-warning" role="alert">
          {error}
        </div>
      )}

      <p className="settings-warning settings-soft-warning">
        Les clés sont vérifiées auprès du fournisseur puis rangées dans le trousseau de votre
        système. Elles ne sont jamais écrites dans votre configuration, ni affichées ici.
      </p>
    </>
  );
}

interface BuiltinProviderRowProps {
  provider: ProviderStatus;
  editing: boolean;
  confirming: boolean;
  secret: string;
  busy: boolean;
  onSecretChange(value: string): void;
  onStartEdit(): void;
  onCancel(): void;
  onSave(): void;
  onStartRemove(): void;
  onCancelRemove(): void;
  onRemove(): void;
}

function BuiltinProviderRow(props: Readonly<BuiltinProviderRowProps>): React.JSX.Element {
  const { provider } = props;
  return (
    <div className="settings-row">
      <span>
        <span className="settings-row-title">{provider.label}</span>
        <span className="settings-row-detail">{describeProviderSource(provider)}</span>
        {provider.source === "environment" && (
          <span className="settings-row-detail">
            Une variable d&apos;environnement l&apos;emporte sur le trousseau : retirez-la de votre
            shell pour utiliser une autre clé.
          </span>
        )}
        {props.confirming && (
          <span className="settings-row-detail provider-confirm">
            Supprimer la clé {provider.label} du trousseau ? Elle sera définitivement perdue : le
            trousseau n&apos;a pas de corbeille, et une clé API ne se réaffiche pas chez le
            fournisseur. Il faudra en générer une nouvelle.
          </span>
        )}
      </span>
      {props.editing ? (
        <span className="provider-key-control">
          <input
            className="settings-input mono"
            type="password"
            value={props.secret}
            placeholder="Collez votre clé"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              props.onSecretChange(event.target.value);
            }}
          />
          <button
            type="button"
            className="button-secondary"
            disabled={props.secret.trim() === "" || props.busy}
            onClick={props.onSave}
          >
            Vérifier
          </button>
          <button type="button" className="chip" onClick={props.onCancel}>
            Annuler
          </button>
        </span>
      ) : (
        <span className="provider-key-control">
          {props.confirming ? (
            <>
              <button
                type="button"
                className="chip chip-danger"
                disabled={props.busy}
                onClick={props.onRemove}
              >
                Supprimer définitivement
              </button>
              <button type="button" className="chip" onClick={props.onCancelRemove}>
                Annuler
              </button>
            </>
          ) : (
            <>
              <button type="button" className="chip chip-active" onClick={props.onStartEdit}>
                {provider.configured ? "Remplacer la clé" : "Ajouter une clé"}
              </button>
              {provider.source === "keychain" && (
                <button
                  type="button"
                  className="chip"
                  disabled={props.busy}
                  onClick={props.onStartRemove}
                >
                  Retirer
                </button>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}

interface EndpointFormProps {
  form: EndpointForm;
  problem: string | undefined;
  busy: boolean;
  onChange(next: EndpointForm): void;
  onCancel(): void;
  onSave(): void;
}

function EndpointForm(props: Readonly<EndpointFormProps>): React.JSX.Element {
  const { form } = props;
  const field = (
    title: string,
    detail: string,
    value: string,
    key: keyof EndpointForm,
    mono = true,
    disabled = false,
  ): React.JSX.Element => (
    <label className="settings-row">
      <span>
        <span className="settings-row-title">{title}</span>
        <span className="settings-row-detail">{detail}</span>
      </span>
      <input
        className={mono ? "settings-input mono" : "settings-input"}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          props.onChange({ ...form, [key]: event.target.value });
        }}
      />
    </label>
  );

  return (
    <div className="settings-card-list provider-form">
      {field(
        "Identifiant",
        "Minuscules, chiffres et tirets.",
        form.id,
        "id",
        true,
        form.mode === "update",
      )}
      {field("Nom affiché", "Facultatif.", form.name, "name", false)}
      {field("URL de base", "L'API compatible OpenAI à appeler.", form.baseUrl, "baseUrl")}
      {field(
        "Variable de clé",
        "Facultatif : le nom de la variable d'environnement à lire.",
        form.apiKeyEnv,
        "apiKeyEnv",
      )}
      {props.problem !== undefined && <p className="settings-note muted">{props.problem}</p>}
      <div className="settings-actions provider-form-actions">
        <button type="button" className="chip" onClick={props.onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={props.problem !== undefined || props.busy}
          onClick={props.onSave}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/** Strips the Electron frame from a rejected `invoke`, keeping the sentence. */
function messageOfIpc(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "");
}

interface ModelsTabProps {
  config: SafeConfig;
  providers: ProviderStatus[];
  onPatchConfig(patch: Parameters<typeof window.reqraft.writeConfig>[0]): void;
}

/** Sentinel for the "type your own identifier" entry in the model list. */
const CUSTOM_MODEL_OPTION = "__custom__";

/**
 * The model that should follow a change of provider.
 *
 * Keeping the previous one is how a configuration ends up naming an Anthropic
 * model with OpenAI selected — accepted by the form, rejected on the first run.
 * A model the new provider already publishes is kept; anything else falls back
 * to what that provider recommends.
 */
export function modelForProvider(next: ProviderStatus | undefined, currentModel: string): string {
  if (!next) return currentModel;
  if (next.models.some((model) => model.id === currentModel)) return currentModel;
  return (next.models.find((model) => model.recommended) ?? next.models[0])?.id ?? "";
}

function ModelsTab({
  config,
  providers,
  onPatchConfig,
}: Readonly<ModelsTabProps>): React.JSX.Element {
  const current = providers.find((provider) => provider.id === config.defaultProvider);
  const models = current?.models ?? [];
  const known = models.some((model) => model.id === config.defaultModel);
  const [custom, setCustom] = useState(false);
  // A provider with no catalogue — a custom endpoint — only has the free field.
  const typing = custom || !known;

  return (
    <div className="settings-card-list">
      <label className="settings-row">
        <span>
          <span className="settings-row-title">Provider par défaut</span>
          <span className="settings-row-detail">Utilisé par la capsule et le popover.</span>
        </span>
        <select
          className="settings-select"
          value={config.defaultProvider}
          onChange={(event) => {
            const providerId = event.target.value as SafeConfig["defaultProvider"];
            const next = providers.find((provider) => provider.id === providerId);
            setCustom(false);
            onPatchConfig({
              defaultProvider: providerId,
              defaultModel: modelForProvider(next, config.defaultModel),
            });
          }}
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.id}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-row">
        <span>
          <span className="settings-row-title">Modèle par défaut</span>
          <span className="settings-row-detail">
            Les modèles pris en charge par ce provider, ou le vôtre.
          </span>
        </span>
        <select
          className="settings-select"
          value={typing ? CUSTOM_MODEL_OPTION : config.defaultModel}
          onChange={(event) => {
            if (event.target.value === CUSTOM_MODEL_OPTION) {
              setCustom(true);
              return;
            }
            setCustom(false);
            onPatchConfig({ defaultModel: event.target.value });
          }}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
              {model.recommended ? " — recommandé" : ""}
            </option>
          ))}
          <option value={CUSTOM_MODEL_OPTION}>Autre identifiant…</option>
        </select>
      </label>

      {typing && (
        <label className="settings-row">
          <span>
            <span className="settings-row-title">Identifiant du modèle</span>
            <span className="settings-row-detail">Envoyé tel quel au provider choisi.</span>
          </span>
          <input
            className="settings-input mono"
            // Keyed on the provider: switching provider changes the value this
            // field should show, and an uncontrolled input keeps the old one.
            key={`${config.defaultProvider}:${config.defaultModel}`}
            defaultValue={config.defaultModel}
            onBlur={(event) => {
              if (event.target.value !== config.defaultModel) {
                onPatchConfig({ defaultModel: event.target.value });
              }
            }}
          />
        </label>
      )}

      <label className="settings-row">
        <span>
          <span className="settings-row-title">Niveau par défaut</span>
          <span className="settings-row-detail">
            S&apos;applique quand le profil ne force aucun niveau.
          </span>
        </span>
        <select
          className="settings-select"
          value={config.defaultLevel}
          onChange={(event) => {
            onPatchConfig({ defaultLevel: event.target.value as SafeConfig["defaultLevel"] });
          }}
        >
          {REPROMPT_LEVEL_IDS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface DiagnosticTabProps {
  doctor: DoctorReport | null;
  running: boolean;
  onRunDoctor(): void;
}

function DiagnosticTab({
  doctor,
  running,
  onRunDoctor,
}: Readonly<DiagnosticTabProps>): React.JSX.Element {
  return (
    <>
      {running && <p className="muted">Diagnostic en cours…</p>}
      <div className="diagnostic-list">
        {doctor?.checks.map((check) => (
          <div
            key={check.id}
            className={check.ok ? "diagnostic-row" : "diagnostic-row diagnostic-row-risk"}
          >
            <span className={check.ok ? "verdict-good" : "verdict-risky"}>
              {check.ok ? "✓" : "!"}
            </span>
            <span className="diagnostic-name">{check.id}</span>
            {check.detail !== undefined && (
              <span className="diagnostic-detail">{check.detail}</span>
            )}
          </div>
        ))}
      </div>
      <div className="settings-actions">
        <button type="button" className="button-secondary" onClick={onRunDoctor} disabled={running}>
          Relancer le diagnostic
        </button>
      </div>
    </>
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
            Choix non disponible : {formatAccelerator(props.active)} est actif à la place.
          </div>
        )}
      </div>
      <div className="shortcut-control">
        <kbd>{formatAccelerator(props.active)}</kbd>
        <select
          className="settings-select"
          value={props.chosen}
          onChange={(event) => {
            props.onChoose(event.target.value);
          }}
        >
          <option value="">Automatique</option>
          {options.map((accelerator) => (
            <option key={accelerator} value={accelerator}>
              {formatAccelerator(accelerator)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * An accelerator written out in words.
 *
 * `⌘⌃⌥N` is four glyphs someone has to already know; three of them look alike
 * at 11px and ⌃ renders as a bare caret in most interface fonts, so `⌘^⌥N` is
 * what the user actually saw. Words cost a few characters and remove the
 * decoding step entirely — which matters most here, where the whole point is
 * to press the right keys.
 */
const MODIFIER_LABELS: readonly (readonly [string, string])[] = [
  ["CommandOrControl", "Cmd"],
  ["Command", "Cmd"],
  ["Control", "Ctrl"],
  ["Alt", "Option"],
  ["Shift", "Maj"],
];

export function formatAccelerator(accelerator: string): string {
  if (accelerator === "") return "—";
  return accelerator
    .split("+")
    .map((part) => MODIFIER_LABELS.find(([name]) => name === part)?.[1] ?? keyLabel(part))
    .join(" + ");
}

/** The non-modifier key, spelled where its name is clearer than its glyph. */
function keyLabel(part: string): string {
  if (part === "Space") return "Espace";
  return part;
}
