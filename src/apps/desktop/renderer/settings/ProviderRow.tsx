import {
  PROVIDER_TEST_BUILTIN_IDS,
  type CatalogProviderId,
  type ProviderStatus,
  type ProviderTestBuiltinId,
  type ProviderTestRequest,
  type ProviderTestResponse,
} from "@/apps/desktop/shared/ipc-contract.js";

import { useT, type Translate } from "../shared/i18n.js";

/**
 * Ce qu'une ligne de fournisseur dit, et ce qu'elle propose.
 *
 * Ce que le canal `providers:test` rend est un verdict fermé, jamais une
 * phrase : un adaptateur peut écrire une URL ou un en-tête dans son message,
 * et le traduire serait de toute façon impossible. Toute la mise en mots d'une
 * ligne vit donc ici — l'origine de la clé comme l'issue du test — avec le
 * bouton et la ligne de résultat qui vont avec.
 *
 * Sorti de `SettingsApp.tsx` parce que c'est une histoire complète, et parce
 * que l'onglet est déjà long. `BuiltinProviderRow` a suivi : la ligne intégrée
 * n'utilise plus rien de l'onglet, et `SettingsApp.tsx` était revenu au plafond
 * de 1000 lignes que `sonarjs/max-lines` fait respecter.
 */

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

/**
 * `openai-compatible` names a family, not one endpoint.
 *
 * Kept as a literal here, the way `OnboardingApp.tsx` already does: the
 * renderer never imports `@/providers/`, so a catalogue identifier travels to
 * this side as a plain string.
 */
const COMPATIBLE_PROVIDER_ID = "openai-compatible";

/** The single row `config.defaultProvider` designates, built-in or endpoint. */
export type DefaultProviderRow =
  { kind: "builtin"; id: CatalogProviderId } | { kind: "endpoint"; id: string };

/**
 * Which row is the one actually used, given the default and the endpoints.
 *
 * A built-in identifier is a row by itself. `openai-compatible` is not: it
 * picks the family, and the registry then builds the endpoint from
 * `Object.values(config.providers)[0]` — the first declared entry, whatever
 * the others say. Marking every endpoint would announce a choice the registry
 * never makes, and marking none would hide the one it does; so the first entry
 * is marked and the rest are not, which is what runs today.
 *
 * `undefined` when nothing on screen can be marked: `openai-compatible` with
 * an empty catalogue names a provider no row describes.
 */
export function findDefaultProviderRow(
  defaultProvider: CatalogProviderId,
  endpointIds: readonly string[],
): DefaultProviderRow | undefined {
  if (defaultProvider !== COMPATIBLE_PROVIDER_ID) {
    return { kind: "builtin", id: defaultProvider };
  }
  const [first] = endpointIds;
  return first === undefined ? undefined : { kind: "endpoint", id: first };
}

/**
 * The mark saying this row is the one the app will use.
 *
 * A word, not a control: the default is chosen in the Models tab, and anything
 * that looked pressable here would promise an action this tab does not have.
 * `title` carries what "Default" cannot say on its own — on an endpoint the
 * row is used because it is declared first, not because it was picked.
 */
export function DefaultProviderBadge(
  props: Readonly<{ kind: DefaultProviderRow["kind"] }>,
): React.JSX.Element {
  const t = useT();
  return (
    <span
      className="provider-default-badge"
      title={
        props.kind === "endpoint"
          ? t("settings.defaultBadgeEndpointTitle")
          : t("settings.defaultBadgeTitle")
      }
    >
      {t("settings.defaultBadge")}
    </span>
  );
}

/**
 * The built-in providers a check can be asked about.
 *
 * `openai-compatible` is not one of them: it names a family, and each endpoint
 * is checked on its own row. `mock` is not either — it answers `ok` whatever
 * happens, so a button offering it would be a test that cannot fail.
 */
const TESTABLE_BUILTIN_IDS: readonly CatalogProviderId[] = PROVIDER_TEST_BUILTIN_IDS;

function isTestableBuiltin(id: CatalogProviderId): id is ProviderTestBuiltinId {
  return TESTABLE_BUILTIN_IDS.includes(id);
}

/**
 * What a built-in row can ask for, or nothing.
 *
 * Absent for a provider with no key: the row already says so, and a button
 * whose only possible answer is "incomplete configuration" reports a fact that
 * was on screen before it was pressed.
 */
export function builtinTestRequest(provider: ProviderStatus): ProviderTestRequest | undefined {
  if (!provider.configured || !isTestableBuiltin(provider.id)) return undefined;
  return { kind: "builtin", id: provider.id };
}

/**
 * How a check reads once it is done.
 *
 * The one detail that travels with the verdict is `missing`, which names
 * configuration entries — `ANTHROPIC_API_KEY`, `baseUrl` — so the answer says
 * what to fix instead of only that something is wrong.
 */
export function describeProviderTest(
  result: ProviderTestResponse,
  t: Translate = (key) => key,
): string {
  switch (result.outcome) {
    case "ok":
      return t("settings.providerTestOk");
    case "missing_configuration":
      return result.missing && result.missing.length > 0
        ? t("settings.providerTestMissing", { list: result.missing.join(", ") })
        : t("settings.providerTestMissingUnknown");
    case "invalid_configuration":
      return t("settings.providerTestInvalid");
    case "unreachable":
      return t("settings.providerTestUnreachable");
    default:
      return t("settings.providerTestError");
  }
}

/**
 * The check itself, identical on a built-in row and on an endpoint row.
 *
 * `disabled` covers a check running anywhere in the tab, not only this one:
 * the results land on the rows they belong to, and letting several run at once
 * would leave the settings unable to say which answer arrived for which row.
 */
export function ProviderTestButton(
  props: Readonly<{ running: boolean; blocked: boolean; onTest(): void }>,
): React.JSX.Element {
  const t = useT();
  return (
    <button type="button" className="chip" disabled={props.blocked} onClick={props.onTest}>
      {props.running ? t("settings.providerTesting") : t("settings.providerTest")}
    </button>
  );
}

/**
 * The verdict, on the line below the row's own description.
 *
 * `role="status"` because the answer arrives after the click and replaces
 * nothing on screen: without it a screen reader would announce a button that
 * stops saying "Testing…" and never say what came back.
 */
export function ProviderTestResult(
  props: Readonly<{ result: ProviderTestResponse }>,
): React.JSX.Element {
  const t = useT();
  return (
    <span
      role="status"
      className={`settings-row-detail ${
        props.result.outcome === "ok" ? "provider-test-ok" : "provider-test-failed"
      }`}
    >
      {describeProviderTest(props.result, t)}
    </span>
  );
}

/** Nommée parce qu'elle sert dans quatre boutons différents. */
export const CANCEL_KEY = "settings.cancel";

interface BuiltinProviderRowProps {
  provider: ProviderStatus;
  /** This is the provider the capsule and the popover will actually use. */
  isDefault: boolean;
  editing: boolean;
  confirming: boolean;
  secret: string;
  busy: boolean;
  /** This row's own check is running. */
  testing: boolean;
  /** Some check is running, this row's or another's. */
  testsBlocked: boolean;
  result: ProviderTestResponse | undefined;
  /** Absent when there is nothing worth checking on this row. */
  onTest: (() => void) | undefined;
  onSecretChange(value: string): void;
  onStartEdit(): void;
  onCancel(): void;
  onSave(): void;
  onStartRemove(): void;
  onCancelRemove(): void;
  onRemove(): void;
}

export function BuiltinProviderRow(props: Readonly<BuiltinProviderRowProps>): React.JSX.Element {
  const t = useT();
  const { provider } = props;
  return (
    <div className="settings-row">
      <span>
        <span className="settings-row-title">
          {provider.label}
          {props.isDefault && <DefaultProviderBadge kind="builtin" />}
        </span>
        <span className="settings-row-detail">{describeProviderSource(provider, t)}</span>
        {provider.source === "environment" && (
          <span className="settings-row-detail">{t("settings.replaceEnvInApp")}</span>
        )}
        {props.result !== undefined && !props.testing && (
          <ProviderTestResult result={props.result} />
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
              {props.onTest !== undefined && (
                <ProviderTestButton
                  running={props.testing}
                  blocked={props.testsBlocked || props.busy}
                  onTest={props.onTest}
                />
              )}
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
