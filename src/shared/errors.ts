import { OPENAI_COMPATIBLE_PROVIDER_ID } from "@/providers/catalog.js";
import { ProviderError } from "@/providers/errors.js";
import { ReqraftError, type ReqraftErrorCode } from "@/core/errors.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

/**
 * A failure presented to the user.
 *
 * Always carries a title, a message, and the next action when one exists.
 * Never carries a stack trace, a payload, a header or a key: `--verbose` puts
 * technical detail on stderr instead.
 */
export interface UiError {
  title: string;
  message: string;
  cause?: string;
  nextAction?: string;
}

/**
 * Where a provider failure sends the person to fix it.
 *
 * These four next actions depend on the surface: a terminal names a command
 * (`rp auth login`, `rp doctor`), a window names the settings tab that does
 * the same. A surface passes its own; without one, the catalogue's wording,
 * written for the terminal, applies.
 */
export interface ProviderAdvice {
  /** The provider refused the key (401, 403). */
  keyRejected(provider: string): string;
  /** The same for a compatible endpoint, whose key comes from a variable. */
  endpointKeyRejected(): string;
  /** No key is configured for the provider. */
  keyMissing(provider: string): string;
  /** Any other refusal: the model or the configuration. */
  requestRejected(): string;
}

const MISSING_KEY_PATTERN = /Clé API .* manquante/;
const DEFAULT_TRANSLATOR = createTranslator("fr");

/** The catalogue's advice, written for the CLI and the TUI. */
function terminalAdvice(t: Translator): ProviderAdvice {
  return {
    keyRejected: (provider) => t("error.apiKeyRejected.action", { provider }),
    endpointKeyRejected: () => t("error.apiKeyRejected.endpointAction"),
    keyMissing: (provider) => t("error.missingKey.action", { provider }),
    requestRejected: () => t("error.rejected.action"),
  };
}

function createBasicError(message: string, t: Translator): UiError {
  return { title: t("common.error"), message };
}

type ErrorMessageResolver = (error: ReqraftError, provider: string, t: Translator) => string;

const ERROR_MESSAGE_RESOLVERS: Partial<Record<ReqraftErrorCode, ErrorMessageResolver>> = {
  "request.cancelled": (_error, _provider, t) => t("error.request.cancelled"),
  "request.timeout": (error, _provider, t) =>
    t("error.request.timeout", { timeoutMs: Number(error.params?.timeoutMs ?? 0) }),
  "result.empty": (_error, _provider, t) => t("error.result.empty"),
  "clipboard.read_failed": (_error, _provider, t) => t("error.clipboard.read"),
  "clipboard.write_failed": (_error, _provider, t) => t("error.clipboard.write"),
  "input.file_unreadable": (error, _provider, t) =>
    t("error.input.file", { path: String(error.params?.path ?? "") }),
  "config.invalid": (error, _provider, t) =>
    t("error.config.invalid", { path: String(error.params?.path ?? "config.json") }),
  "config.value_invalid": (error, _provider, t) =>
    t("error.config.valueInvalid", {
      key: String(error.params?.key ?? ""),
      expected: String(error.params?.expected ?? ""),
    }),
  "runtime.option_invalid": (error, _provider, t) =>
    t("error.runtime.optionInvalid", {
      label: error.params?.option === "timeout" ? t("reprompt.timeout") : t("reprompt.outputLimit"),
    }),
  "alias.name_empty": (_error, _provider, t) => t("error.alias.nameEmpty"),
  "alias.name_invalid": (error, _provider, t) =>
    t("error.alias.nameInvalid", { name: String(error.params?.name ?? "") }),
  "alias.name_reserved": (error, _provider, t) =>
    t("error.alias.nameReserved", { name: String(error.params?.name ?? "") }),
  "alias.exists": (error, _provider, t) =>
    t("error.alias.exists", {
      name: String(error.params?.name ?? ""),
      path: String(error.params?.path ?? ""),
    }),
  "alias.not_found": (error, _provider, t) =>
    t("error.alias.notFound", {
      name: String(error.params?.name ?? ""),
      path: String(error.params?.path ?? ""),
    }),
  "profile.unknown": (error, _provider, t) =>
    t("error.profile.unknown", { profile: String(error.params?.profile ?? "") }),
  "level.invalid": (error, _provider, t) =>
    t("error.level.invalid", { level: String(error.params?.level ?? "") }),
  "provider.unsupported": (error, _provider, t) =>
    t("error.provider.unsupported", { provider: String(error.params?.provider ?? "") }),
  "credential.placeholder": (error, _provider, t) => {
    const envName = error.params?.envName;
    return typeof envName === "string"
      ? t("error.credential.placeholderEnv", { envName })
      : t("error.credential.placeholder");
  },
  "credential.storage_unavailable": (error, provider, t) =>
    t("error.credential.storage", { provider: String(error.params?.provider ?? provider) }),
  "provider.request_failed": (error, provider, t) =>
    t("error.provider.network", {
      provider: String(error.params?.provider ?? provider),
    }),
};

function describeReqraftError(error: ReqraftError, provider: string, t: Translator): UiError {
  const resolveMessage = ERROR_MESSAGE_RESOLVERS[error.errorCode];
  return createBasicError(
    resolveMessage?.(error, provider, t) ?? t("error.internal.unexpected"),
    t,
  );
}

function describeHttpStatus(
  status: number,
  provider: string,
  t: Translator,
  advice: ProviderAdvice,
): UiError {
  if (status === 401 || status === 403) {
    return {
      title: t("error.apiKeyRejected.title"),
      message: t("error.apiKeyRejected.message", { provider }),
      // A compatible endpoint has no stored key (`rp auth login` does not
      // take one): its key comes from the variable configured for it.
      nextAction:
        provider === OPENAI_COMPATIBLE_PROVIDER_ID
          ? advice.endpointKeyRejected()
          : advice.keyRejected(provider),
    };
  }
  if (status === 402) {
    return {
      title: t("error.credit.title"),
      message: t("error.credit.message", { provider }),
      nextAction: t("error.credit.action"),
    };
  }
  if (status === 429) {
    return {
      title: t("error.rateLimit.title"),
      message: t("error.rateLimit.message", { provider }),
      nextAction: t("error.rateLimit.action"),
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      title: t("error.unavailable.title"),
      message: t("error.unavailable.message", { provider }),
      nextAction: t("error.unavailable.action"),
    };
  }
  return {
    title: t("error.rejected.title"),
    message: t("error.rejected.message", { provider, httpStatus: status }),
    nextAction: advice.requestRejected(),
  };
}

/**
 * A failure, as a surface shows it.
 *
 * `advice` words the next actions that name somewhere to go; the CLI and the
 * TUI keep the catalogue's, the desktop passes its settings tabs.
 */
export function describeUiError(
  error: unknown,
  provider: string,
  t: Translator = DEFAULT_TRANSLATOR,
  advice: ProviderAdvice = terminalAdvice(t),
): UiError {
  const message = error instanceof Error ? error.message : String(error);
  const status = getProviderHttpStatus(error, message);

  if (status !== undefined) {
    // The raw body is dropped on purpose: it can echo the prompt or the key.
    return describeHttpStatus(status, provider, t, advice);
  }

  if (error instanceof ReqraftError) {
    return describeReqraftError(error, provider, t);
  }

  if (MISSING_KEY_PATTERN.test(message)) {
    return {
      title: t("error.missingKey.title"),
      message: t("error.missingKey.message", { provider }),
      nextAction: advice.keyMissing(provider),
    };
  }

  return createBasicError(t("error.internal.unexpected"), t);
}

/**
 * The provider a failure names, if it carries one.
 *
 * For the surfaces that do not know which provider they were talking to — an
 * error that reaches the top of the CLI — so the advice names a real one.
 */
export function providerNamedBy(error: unknown): string | undefined {
  const provider = error instanceof ReqraftError ? error.params?.provider : undefined;
  return typeof provider === "string" ? provider : undefined;
}

/** Flattens a UiError for surfaces that only accept a single line. */
export function formatUiError(
  error: unknown,
  provider: string,
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  const described = describeUiError(error, provider, t);
  return [described.message, described.cause, described.nextAction]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}

function getProviderHttpStatus(error: unknown, message: string): number | undefined {
  if (error instanceof ProviderError) {
    return error.httpStatus;
  }
  const legacyStatus = /Provider error (\d{3})/.exec(message)?.[1];
  return legacyStatus === undefined ? undefined : Number(legacyStatus);
}
