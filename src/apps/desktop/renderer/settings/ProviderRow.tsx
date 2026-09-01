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
 * que l'onglet est déjà long.
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
