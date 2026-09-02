import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Hash, RefreshCw, Sparkles } from "lucide-react";
import {
  MODEL_CATALOG_BUILTIN_IDS,
  REPROMPT_LEVEL_IDS,
  type ModelCatalogBuiltinId,
  type ModelsListRequest,
  type ModelsListResponse,
  type ProviderStatus,
  type SafeConfig,
} from "@/apps/desktop/shared/ipc-contract.js";

import { useT, type Translate } from "../shared/i18n.js";
import { Button } from "../shared/Button.js";
import { InlineMessage, type MessageTone } from "../shared/InlineMessage.js";
import { ProviderLogo } from "./ProviderLogo.js";

interface ModelsTabProps {
  config: SafeConfig;
  providers: ProviderStatus[];
  onPatchConfig(patch: Parameters<typeof window.reqraft.writeConfig>[0]): void;
}

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; response: ModelsListResponse }
  | { status: "unavailable" }
  | { status: "error" };

const CUSTOM_MODEL_OPTION = "__custom__";
const COMPATIBLE_PROVIDER_ID = "openai-compatible";
const CATALOG_BUILTIN_IDS: readonly string[] = MODEL_CATALOG_BUILTIN_IDS;

function isCatalogBuiltinId(id: string): id is ModelCatalogBuiltinId {
  return CATALOG_BUILTIN_IDS.includes(id);
}

export function modelForProvider(next: ProviderStatus | undefined, currentModel: string): string {
  if (!next) return currentModel;
  if (next.models.some((model) => model.id === currentModel)) return currentModel;
  return (next.models.find((model) => model.recommended) ?? next.models[0])?.id ?? currentModel;
}

export function modelCatalogRequest(
  providerId: SafeConfig["defaultProvider"],
  firstEndpointId: string | undefined,
): ModelsListRequest | undefined {
  if (providerId === COMPATIBLE_PROVIDER_ID) {
    return firstEndpointId === undefined ? undefined : { kind: "endpoint", id: firstEndpointId };
  }
  return isCatalogBuiltinId(providerId) ? { kind: "builtin", id: providerId } : undefined;
}

export function describeModelCatalog(state: CatalogState, t: Translate = (key) => key): string {
  if (state.status === "loading") return t("settings.modelCatalogLoading");
  if (state.status === "unavailable") return t("settings.modelCatalogNoEndpoint");
  if (state.status === "error") return t("settings.modelCatalogError");

  const { response } = state;
  if (response.outcome === "ok") {
    if (response.models.length === 0) return t("settings.modelCatalogEmpty");
    return response.truncated
      ? t("settings.modelCatalogReadyTruncated", { count: String(response.models.length) })
      : t("settings.modelCatalogReady", { count: String(response.models.length) });
  }
  if (response.outcome === "unsupported") return t("settings.modelCatalogUnsupported");
  if (response.outcome === "missing_configuration") {
    return response.missing && response.missing.length > 0
      ? t("settings.modelCatalogMissing", { list: response.missing.join(", ") })
      : t("settings.modelCatalogMissingUnknown");
  }
  return t("settings.modelCatalogError");
}

export function modelCatalogTone(state: CatalogState): MessageTone {
  if (state.status === "loading") return "pending";
  if (state.status === "error") return "error";
  if (state.status === "unavailable") return "info";

  const { response } = state;
  if (response.outcome === "ok") return response.models.length === 0 ? "warning" : "success";
  if (response.outcome === "unsupported") return "info";
  return "warning";
}

export function ModelsTab({
  config,
  providers,
  onPatchConfig,
}: Readonly<ModelsTabProps>): React.JSX.Element {
  const t = useT();
  const firstEndpointId = Object.keys(config.providers ?? {})[0];
  const request = useMemo(
    () => modelCatalogRequest(config.defaultProvider, firstEndpointId),
    [config.defaultProvider, firstEndpointId],
  );
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [custom, setCustom] = useState(false);
  const requestSequence = useRef(0);

  const loadCatalog = useCallback(() => {
    requestSequence.current += 1;
    const sequence = requestSequence.current;
    if (request === undefined) {
      setCatalog({ status: "unavailable" });
      return;
    }

    setCatalog({ status: "loading" });
    void window.reqraft
      .listModels(request)
      .then((response) => {
        if (requestSequence.current === sequence) setCatalog({ status: "ready", response });
      })
      .catch(() => {
        if (requestSequence.current === sequence) setCatalog({ status: "error" });
      });
  }, [request]);

  useEffect(() => {
    setCustom(false);
    loadCatalog();
    return () => {
      requestSequence.current += 1;
    };
  }, [loadCatalog]);

  const liveModels =
    catalog.status === "ready" && catalog.response.outcome === "ok" ? catalog.response.models : [];
  const hasLiveCatalog = liveModels.length > 0;
  const known = liveModels.some((model) => model.id === config.defaultModel);
  const typing = custom || !hasLiveCatalog || !known;
  const loading = catalog.status === "loading";

  return (
    <>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.models.routing")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <label className="settings-group-row">
              <ProviderLogo providerId={config.defaultProvider} label={config.defaultProvider} />
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.defaultProvider")}</span>
                <span className="settings-row-detail">{t("settings.defaultProviderDetail")}</span>
              </span>
              <span className="settings-row-control">
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
                      {provider.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <label className="settings-group-row">
              <span className="settings-row-icon">
                <Sparkles size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.defaultModel")}</span>
                <span className="settings-row-detail">{t("settings.defaultModelDetail")}</span>
              </span>
              <span className="settings-row-control">
                <select
                  className="settings-select"
                  value={typing ? CUSTOM_MODEL_OPTION : config.defaultModel}
                  disabled={!hasLiveCatalog}
                  onChange={(event) => {
                    if (event.target.value === CUSTOM_MODEL_OPTION) {
                      setCustom(true);
                      return;
                    }
                    setCustom(false);
                    onPatchConfig({ defaultModel: event.target.value });
                  }}
                >
                  {liveModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_OPTION}>{t("settings.otherModel")}</option>
                </select>
              </span>
            </label>

            {typing && (
              <label className="settings-group-row settings-group-row-entering">
                <span className="settings-row-icon">
                  <Hash size={18} strokeWidth={1.7} aria-hidden />
                </span>
                <span className="settings-group-copy">
                  <span className="settings-row-title">{t("settings.modelId")}</span>
                  <span className="settings-row-detail">{t("settings.modelIdDetail")}</span>
                </span>
                <span className="settings-row-control">
                  <input
                    className="settings-input mono"
                    key={`${config.defaultProvider}:${config.defaultModel}`}
                    defaultValue={config.defaultModel}
                    onBlur={(event) => {
                      if (event.target.value !== config.defaultModel) {
                        onPatchConfig({ defaultModel: event.target.value });
                      }
                    }}
                  />
                </span>
              </label>
            )}
          </div>

          <div className="settings-group-foot settings-group-foot-split">
            <InlineMessage tone={modelCatalogTone(catalog)}>
              {describeModelCatalog(catalog, t)}
            </InlineMessage>
            <div className="settings-actions">
              <Button
                variant="neutral"
                onClick={loadCatalog}
                disabled={loading}
                aria-busy={loading}
                aria-label={t("settings.refreshModels")}
                title={t("settings.refreshModels")}
              >
                <RefreshCw size={13} className={loading ? "spin" : undefined} aria-hidden />
                {t("settings.refresh")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.models.rewriting")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <label className="settings-group-row">
              <span className="settings-row-icon">
                <Gauge size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.defaultLevel")}</span>
                <span className="settings-row-detail">{t("settings.defaultLevelDetail")}</span>
              </span>
              <span className="settings-row-control">
                <select
                  className="settings-select"
                  value={config.defaultLevel}
                  onChange={(event) => {
                    onPatchConfig({
                      defaultLevel: event.target.value as SafeConfig["defaultLevel"],
                    });
                  }}
                >
                  {REPROMPT_LEVEL_IDS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>
        </div>
      </section>
    </>
  );
}
