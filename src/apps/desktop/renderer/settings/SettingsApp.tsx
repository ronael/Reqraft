import { type ComponentType, useCallback, useEffect, useState } from "react";
import {
  CircleArrowUp,
  Cpu,
  Plus,
  SlidersHorizontal,
  Stethoscope,
  UserRound,
  Waypoints,
} from "lucide-react";
import {
  REPROMPT_LEVEL_IDS,
  type DesktopUpdateState,
  type DoctorReport,
  type PermissionsState,
  type ProviderStatus,
  type SafeConfig,
  type ShortcutStateInfo,
} from "@/apps/desktop/shared/ipc-contract.js";

import { ProfilesTab } from "./ProfilesTab.js";
import { useT, type Translate } from "../shared/i18n.js";
import { PreferencesTab } from "./PreferencesTab.js";
import { UpdatesTab } from "./UpdatesTab.js";
import { version } from "@/version.js";

const TABS = ["profiles", "providers", "models", "preferences", "updates", "diagnostic"] as const;
type Tab = (typeof TABS)[number];

export function initialSettingsTab(search: string = window.location.search): Tab {
  const requested = new URLSearchParams(search).get("tab");
  return TABS.includes(requested as Tab) ? (requested as Tab) : "profiles";
}

const TAB_META: Record<
  Tab,
  {
    icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    titleKey: string;
    detailKey: string;
  }
> = {
  profiles: {
    icon: UserRound,
    titleKey: "settings.nav.profiles",
    detailKey: "settings.profiles.detail",
  },
  providers: {
    icon: Waypoints,
    titleKey: "settings.nav.providers",
    detailKey: "settings.providers.detail",
  },
  models: {
    icon: Cpu,
    titleKey: "settings.nav.models",
    detailKey: "settings.models.detail",
  },
  preferences: {
    icon: SlidersHorizontal,
    titleKey: "settings.nav.preferences",
    detailKey: "settings.preferences.detail",
  },
  updates: {
    icon: CircleArrowUp,
    titleKey: "settings.nav.updates",
    detailKey: "settings.updates.detail",
  },
  diagnostic: {
    icon: Stethoscope,
    titleKey: "settings.nav.diagnostic",
    detailKey: "settings.diagnostic.detail",
  },
};

/**
 * Settings surface (DESKTOP.md lot 5): five horizontal tabs, no sidebar.
 * Parity with `rp config`, `rp doctor`, `rp auth status` — everything goes
 * through the IPC contract; no API key is ever displayed, only
 * configured/absent states (§2.2).
 */
export function SettingsApp(): React.JSX.Element {
  const t = useT();
  const [tab, setTab] = useState<Tab>(() => initialSettingsTab());
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutStateInfo | null>(null);
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [updates, setUpdates] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    void window.reqraft.readConfig().then(setConfig);
    void window.reqraft.providersStatus().then(setProviders);
    void window.reqraft.shortcutsState().then(setShortcuts);
    void window.reqraft.permissionsState().then(setPermissions);
    void window.reqraft.updatesState().then(setUpdates);
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
    void window.reqraft.writeConfig(patch).then(async (nextConfig) => {
      setConfig(nextConfig);
      if (patch.desktopShortcuts !== undefined) {
        setShortcuts(await window.reqraft.shortcutsState());
      }
    });
  }, []);

  const askPermissions = useCallback(() => {
    void window.reqraft
      .requestPermissions()
      .then(() => window.reqraft.permissionsState())
      .then(setPermissions);
  }, []);

  const checkForUpdates = useCallback(() => {
    setUpdates((current) => ({
      status: "checking",
      currentVersion: current?.currentVersion ?? version,
    }));
    void window.reqraft.checkForUpdates().then(setUpdates);
  }, []);

  // The raw accelerator, not the main process's label: the row compares it to
  // the configured choice, and comparing two strings produced by two different
  // formatters is a false mismatch waiting to happen.
  const captureShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "capture")?.accelerator ?? "";
  const inputShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "input")?.accelerator ?? "";
  const popoverShortcut =
    shortcuts?.registered.find((entry) => entry.intent === "popover")?.accelerator ?? "";
  const rejectedShortcuts = shortcuts?.rejected ?? [];
  const conflictingShortcuts = shortcuts?.conflicts ?? [];
  const hasNoShortcut = shortcuts !== null && shortcuts.registered.length === 0;
  const configuredProviderCount = providers.filter((provider) => provider.configured).length;
  const activeTab = TAB_META[tab];

  function permissionDetail(): string {
    if (permissions?.reason !== undefined) {
      return permissions.reason;
    }
    if (permissions?.canReplace === true) {
      return t("settings.permissionsGranted");
    }
    return t("settings.permissionsNeeded");
  }

  return (
    <main className="settings">
      <div className="settings-titlebar">
        <div className="settings-titlebar-spacer" aria-hidden />
        <div className="settings-title">Reqraft</div>
        <span className="settings-ready">{t("settings.ready")}</span>
      </div>

      <div className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-brand">
            <div>
              <span className="settings-brand-name">reqraft</span>
              <span className="settings-brand-version">{version}</span>
            </div>
            <p>{t("settings.tagline")}</p>
          </div>

          <nav className="settings-nav" aria-label={t("settings.title")}>
            {TABS.map((label) => (
              <SettingsNavItem
                key={label}
                active={label === tab}
                meta={TAB_META[label]}
                onClick={() => {
                  setTab(label);
                  if (label === "diagnostic" && doctor === null && !doctorRunning) {
                    runDoctor();
                  }
                  if (label === "updates" && (updates === null || updates.status === "idle")) {
                    checkForUpdates();
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
              <h1>{t(activeTab.titleKey)}</h1>
              <p>{t(activeTab.detailKey)}</p>
            </div>
          </header>

          <div className="settings-panel">
            {tab === "preferences" && (
              <PreferencesTab
                captureShortcut={captureShortcut}
                inputShortcut={inputShortcut}
                popoverShortcut={popoverShortcut}
                rejectedShortcuts={rejectedShortcuts}
                conflictingShortcuts={conflictingShortcuts}
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
                uiLocale={config?.uiLocale ?? "auto"}
                onChooseLanguage={(preference) => {
                  patchConfig({ uiLocale: preference });
                }}
                onOpenWelcomeTour={() => {
                  void window.reqraft.openWelcomeTour();
                }}
              />
            )}

            {tab === "providers" && config !== null && (
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

            {tab === "models" && config !== null && (
              <ModelsTab config={config} providers={providers} onPatchConfig={patchConfig} />
            )}

            {tab === "profiles" && config !== null && (
              <ProfilesTab
                config={config}
                onSelectDefault={(id) => {
                  patchConfig({ defaultProfile: id });
                }}
              />
            )}

            {tab === "diagnostic" && (
              <DiagnosticTab doctor={doctor} running={doctorRunning} onRunDoctor={runDoctor} />
            )}

            {tab === "updates" && (
              <UpdatesTab
                state={updates}
                onCheck={checkForUpdates}
                onOpenDownload={() => {
                  void window.reqraft.openUpdateDownload();
                }}
              />
            )}
          </div>
        </section>
      </div>

      <footer className="settings-statusbar">
        <span>
          {config === null
            ? t("settings.loadingConfig")
            : `${config.defaultProvider} · ${config.defaultModel}`}
        </span>
        <span>{t("settings.footer")}</span>
      </footer>
    </main>
  );
}

interface SettingsNavItemProps {
  active: boolean;
  meta: (typeof TAB_META)[Tab];
  onClick(): void;
}

function SettingsNavItem({
  active,
  meta,
  onClick,
}: Readonly<SettingsNavItemProps>): React.JSX.Element {
  const t = useT();
  const Icon = meta.icon;
  return (
    <button
      type="button"
      className={active ? "settings-nav-item settings-nav-item-active" : "settings-nav-item"}
      onClick={onClick}
    >
      <Icon size={15} aria-hidden />
      {/* Le libellé traduit, pas la clé d'onglet : `label` est un identifiant
          interne, et l'afficher laissait « Modèles » dans une fenêtre anglaise. */}
      <span>{t(meta.titleKey)}</span>
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
  const t = useT();
  return (
    <>
      <div className="settings-context">
        <div className="settings-context-title">{t("settings.context")}</div>
        <dl>
          <ContextRow
            label={t("settings.context.provider")}
            value={config?.defaultProvider ?? "—"}
          />
          <ContextRow
            label={t("settings.context.model")}
            value={config?.defaultModel ?? "—"}
            mono
          />
          <ContextRow label={t("settings.context.profile")} value={config?.defaultProfile ?? "—"} />
          <ContextRow label={t("settings.context.level")} value={config?.defaultLevel ?? "—"} />
        </dl>
      </div>
      <div className="settings-sidebar-note">
        {t(
          configuredProviderCount > 1
            ? "settings.providersConfiguredPlural"
            : "settings.providersConfigured",
          { count: String(configuredProviderCount) },
        )}
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
  t: Translate = (key) => key,
): string | undefined {
  const id = form.id.trim();
  if (!id) return t("settings.identifierMissing");
  if (!/^[a-z0-9-]+$/.test(id)) {
    return t("settings.identifierFormat");
  }
  if (form.mode === "create" && takenIds.includes(id)) {
    return t("settings.identifierTaken");
  }
  const parsed = URL.parse(form.baseUrl.trim());
  if (parsed?.protocol !== "http:" && parsed?.protocol !== "https:") {
    return t("settings.baseUrlScheme");
  }
  return undefined;
}

/** How a credential's origin reads, and whether the settings can change it. */
export function describeProviderSource(
  provider: ProviderStatus,
  t: Translate = (key) => key,
): string {
  if (!provider.requiresApiKey) return t("settings.keyNotNeeded");
  switch (provider.source) {
    case "environment":
      return t("settings.keyFromEnv", { envName: provider.envName ?? "" });
    case "keychain":
      return t("settings.keyInKeychain");
    default:
      return t("settings.noKeyStored");
  }
}

function ProvidersTab(props: Readonly<ProvidersTabProps>): React.JSX.Element {
  const t = useT();
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
      const response = await window.reqraft.saveCredential({
        provider: provider.id,
        secret,
        preferKeychain: provider.source === "environment",
      });
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
      <h3 className="settings-subhead">{t("settings.builtinProviders")}</h3>
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

      <h3 className="settings-subhead">{t("settings.compatibleProviders")}</h3>
      <div className="settings-card-list">
        {endpoints.length === 0 && !form && (
          <p className="settings-note muted">{t("settings.noCustomProvider")}</p>
        )}
        {endpoints.map(([id, endpoint]) => (
          <div key={id} className="settings-row">
            <span>
              <span className="settings-row-title">{endpoint.name ?? id}</span>
              <span className="settings-row-detail mono">{endpoint.baseUrl}</span>
              <span className="settings-row-detail">
                {endpoint.apiKeyEnv === undefined
                  ? t("settings.endpointNoKey")
                  : t("settings.keyFromEnv", { envName: endpoint.apiKeyEnv })}
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
                {t("settings.edit")}
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
                    {t("settings.confirm")}
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setConfirming(null);
                    }}
                  >
                    {t(CANCEL_KEY)}
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
                  {t("settings.delete")}
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
            <Plus size={13} aria-hidden /> {t("settings.addProvider")}
          </button>
        </div>
      )}

      {error !== null && (
        <div className="settings-warning" role="alert">
          {error}
        </div>
      )}

      <p className="settings-warning settings-soft-warning">{t("settings.keysNote")}</p>
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
  const t = useT();
  const { provider } = props;
  return (
    <div className="settings-row">
      <span>
        <span className="settings-row-title">{provider.label}</span>
        <span className="settings-row-detail">{describeProviderSource(provider, t)}</span>
        {provider.source === "environment" && (
          <span className="settings-row-detail">{t("settings.replaceEnvInApp")}</span>
        )}
        {props.confirming && (
          <span className="settings-row-detail provider-confirm">
            {t("settings.confirmDeleteKey", { provider: provider.label })}
          </span>
        )}
      </span>
      {props.editing ? (
        <span className="provider-key-control">
          <input
            className="settings-input mono"
            type="password"
            value={props.secret}
            placeholder={t("settings.pasteKey")}
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
            {t("settings.verify")}
          </button>
          <button type="button" className="chip" onClick={props.onCancel}>
            {t(CANCEL_KEY)}
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
                {t("settings.deleteForever")}
              </button>
              <button type="button" className="chip" onClick={props.onCancelRemove}>
                {t(CANCEL_KEY)}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="chip chip-active" onClick={props.onStartEdit}>
                {provider.configured ? t("settings.replaceKey") : t("settings.addKey")}
              </button>
              {provider.source === "keychain" && (
                <button
                  type="button"
                  className="chip"
                  disabled={props.busy}
                  onClick={props.onStartRemove}
                >
                  {t("settings.remove")}
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
  const t = useT();
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
        t("settings.identifier"),
        t("settings.endpointIdDetail"),
        form.id,
        "id",
        true,
        form.mode === "update",
      )}
      {field(
        t("settings.endpointNameLabel"),
        t("settings.endpointNameDetail"),
        form.name,
        "name",
        false,
      )}
      {field(
        t("settings.endpointBaseUrlLabel"),
        t("settings.endpointBaseUrlDetail"),
        form.baseUrl,
        "baseUrl",
      )}
      {field(
        t("settings.endpointKeyEnvLabel"),
        t("settings.endpointKeyEnvDetail"),
        form.apiKeyEnv,
        "apiKeyEnv",
      )}
      {props.problem !== undefined && <p className="settings-note muted">{props.problem}</p>}
      <div className="settings-actions provider-form-actions">
        <button type="button" className="chip" onClick={props.onCancel}>
          {t(CANCEL_KEY)}
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={props.problem !== undefined || props.busy}
          onClick={props.onSave}
        >
          {t("settings.save")}
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

/** Nommée parce qu'elle sert dans quatre boutons différents. */
const CANCEL_KEY = "settings.cancel";

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
  const t = useT();
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
          <span className="settings-row-title">{t("settings.defaultProvider")}</span>
          <span className="settings-row-detail">{t("settings.defaultProviderDetail")}</span>
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
          <span className="settings-row-title">{t("settings.defaultModel")}</span>
          <span className="settings-row-detail">{t("settings.defaultModelDetail")}</span>
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
              {model.recommended ? t("common.recommendedSuffix") : ""}
            </option>
          ))}
          <option value={CUSTOM_MODEL_OPTION}>{t("settings.otherModel")}</option>
        </select>
      </label>

      {typing && (
        <label className="settings-row">
          <span>
            <span className="settings-row-title">{t("settings.modelId")}</span>
            <span className="settings-row-detail">{t("settings.modelIdDetail")}</span>
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
          <span className="settings-row-title">{t("settings.defaultLevel")}</span>
          <span className="settings-row-detail">{t("settings.defaultLevelDetail")}</span>
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
  const t = useT();
  return (
    <>
      {running && <p className="muted">{t("settings.diagnosticRunning")}</p>}
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
          {t("settings.rerunDiagnostic")}
        </button>
      </div>
    </>
  );
}
