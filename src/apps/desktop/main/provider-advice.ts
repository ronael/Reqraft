import type { ProviderAdvice } from "@/shared/errors.js";
import { t } from "./i18n.js";

/**
 * Where a window sends someone after a provider refusal.
 *
 * The shared descriptions advise `rp auth login` and `rp doctor`, commands no
 * window runs. The desktop names the Settings tab that does the same:
 * Providers for a key or an endpoint's key variable, Diagnostic for the model
 * and the configuration. The message already names the provider, so the
 * advice does not repeat it.
 */
export const DESKTOP_PROVIDER_ADVICE: ProviderAdvice = {
  keyRejected: () => t("main.keyRejectedAction"),
  endpointKeyRejected: () => t("main.endpointKeyRejectedAction"),
  keyMissing: () => t("main.keyMissingAction"),
  requestRejected: () => t("main.requestRejectedAction"),
};
