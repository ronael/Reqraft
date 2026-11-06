import { describe, expect, it } from "vitest";
import {
  ReqraftError,
  RequestCancelledError,
  RequestTimeoutError,
  normalizeReqraftError,
  type ReqraftErrorCode,
  type ReqraftErrorParams,
} from "@/core/errors.js";
import { EmptyProviderResponseError } from "@/core/validation.js";
import { createTranslator } from "@/i18n/translate.js";
import { ProviderError, raiseProviderError } from "@/providers/errors.js";
import { describeUiError, formatUiError, providerNamedBy, type UiError } from "@/shared/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

const en = createTranslator("en");
const fr = createTranslator("fr");

/** What a provider may send back with an HTTP error; none of it may reach the user. */
const PROVIDER_BODY = '{"error":{"message":"Incorrect API key provided: sk-proj-leaked"}}';

/** The error an adapter raises for an HTTP failure from the openai provider. */
function httpFailure(status: number): unknown {
  try {
    raiseProviderError("openai", new Response(PROVIDER_BODY, { status }), PROVIDER_BODY);
  } catch (error) {
    return error;
  }
}

function failure(code: ReqraftErrorCode, params?: ReqraftErrorParams): ReqraftError {
  return new ReqraftError(code, EXIT_CODES.INVALID_INPUT, { params });
}

interface ErrorKind {
  readonly kind: string;
  readonly error: unknown;
  readonly en: UiError;
  readonly fr: UiError;
}

const ERROR_KINDS: readonly ErrorKind[] = [
  {
    kind: "a rejected API key (HTTP 401)",
    error: httpFailure(401),
    en: {
      title: "API key rejected",
      message: "The openai API key was rejected.",
      nextAction: "Run “rp auth login openai” or check the corresponding environment variable.",
    },
    fr: {
      title: "Clé API refusée",
      message: "La clé API openai a été refusée.",
      nextAction:
        "Lance « rp auth login openai » ou vérifie la variable d’environnement correspondante.",
    },
  },
  {
    kind: "a forbidden request (HTTP 403)",
    error: httpFailure(403),
    en: {
      title: "API key rejected",
      message: "The openai API key was rejected.",
      nextAction: "Run “rp auth login openai” or check the corresponding environment variable.",
    },
    fr: {
      title: "Clé API refusée",
      message: "La clé API openai a été refusée.",
      nextAction:
        "Lance « rp auth login openai » ou vérifie la variable d’environnement correspondante.",
    },
  },
  {
    kind: "an exhausted credit (HTTP 402)",
    error: httpFailure(402),
    en: {
      title: "Insufficient credit",
      message: "The openai account has no credit left.",
      nextAction: "Add provider credit before trying again.",
    },
    fr: {
      title: "Crédit insuffisant",
      message: "Le compte openai n’a plus de crédit.",
      nextAction: "Recharge le compte provider avant de réessayer.",
    },
  },
  {
    kind: "a rate limit (HTTP 429)",
    error: httpFailure(429),
    en: {
      title: "Rate limit reached",
      message: "openai is temporarily limiting requests.",
      nextAction: "Wait a few seconds, then generate again.",
    },
    fr: {
      title: "Limite de requêtes atteinte",
      message: "openai limite temporairement les requêtes.",
      nextAction: "Patiente quelques secondes puis régénère.",
    },
  },
  {
    kind: "an unavailable provider (HTTP 503)",
    error: httpFailure(503),
    en: {
      title: "Provider unavailable",
      message: "openai is temporarily unavailable.",
      nextAction: "Try again in a few moments.",
    },
    fr: {
      title: "Provider indisponible",
      message: "openai est temporairement indisponible.",
      nextAction: "Réessaie dans quelques instants.",
    },
  },
  {
    kind: "a rejected request (HTTP 404)",
    error: httpFailure(404),
    en: {
      title: "Request rejected",
      message: "Request rejected by openai (HTTP 404).",
      nextAction: "Check the model and configuration with “rp doctor”, then retry.",
    },
    fr: {
      title: "Requête refusée",
      message: "Requête refusée par openai (HTTP 404).",
      nextAction: "Vérifie le modèle et la configuration avec « rp doctor », puis réessaie.",
    },
  },
  {
    kind: "a missing API key (legacy message)",
    error: new Error("Clé API OpenAI manquante : définis OPENAI_API_KEY."),
    en: {
      title: "API key missing",
      message: "No API key is configured for openai.",
      nextAction: "Run “rp auth login openai” to configure it.",
    },
    fr: {
      title: "Clé API absente",
      message: "Aucune clé API n’est configurée pour openai.",
      nextAction: "Lance « rp auth login openai » pour la configurer.",
    },
  },
  {
    kind: "an unreachable provider",
    error: new ProviderError(
      "provider.request_failed",
      EXIT_CODES.PROVIDER_NETWORK,
      new TypeError("fetch failed"),
      { provider: "Ollama" },
    ),
    en: {
      title: "Error",
      message:
        "Ollama is unreachable. Check the network connection and provider base URL, then retry.",
    },
    fr: {
      title: "Erreur",
      message:
        "Ollama est inaccessible. Vérifie la connexion réseau et la base URL du provider, puis réessaie.",
    },
  },
  {
    kind: "a cancelled generation",
    error: new RequestCancelledError(),
    en: { title: "Error", message: "Generation cancelled." },
    fr: { title: "Erreur", message: "Génération interrompue." },
  },
  {
    kind: "a timeout",
    error: new RequestTimeoutError(30_000),
    en: { title: "Error", message: "The provider did not respond within 30000 ms." },
    fr: { title: "Erreur", message: "Le provider n’a pas répondu dans le délai de 30000 ms." },
  },
  {
    kind: "an empty result",
    error: new EmptyProviderResponseError(),
    en: {
      title: "Error",
      message:
        "The model reached its output limit without producing visible text. Try a higher limit or a faster model.",
    },
    fr: {
      title: "Erreur",
      message:
        "Le modèle a consommé la limite de sortie sans produire de texte visible. Réessaie avec une limite supérieure ou un modèle plus rapide.",
    },
  },
  {
    kind: "an unreadable clipboard",
    error: failure("clipboard.read_failed"),
    en: { title: "Error", message: "Unable to read the clipboard." },
    fr: { title: "Erreur", message: "Impossible de lire le presse-papiers." },
  },
  {
    kind: "a failed clipboard write",
    error: failure("clipboard.write_failed"),
    en: { title: "Error", message: "Unable to write to the clipboard." },
    fr: { title: "Erreur", message: "Impossible d'écrire dans le presse-papiers." },
  },
  {
    kind: "an unreadable input file",
    error: failure("input.file_unreadable", { path: "notes.md" }),
    en: { title: "Error", message: "Unable to read file notes.md." },
    fr: { title: "Erreur", message: "Impossible de lire le fichier notes.md." },
  },
  {
    kind: "an invalid configuration file",
    error: failure("config.invalid", { path: "/home/ada/.config/reqraft/config.json" }),
    en: {
      title: "Error",
      message: "The configuration file is invalid: /home/ada/.config/reqraft/config.json.",
    },
    fr: {
      title: "Erreur",
      message: "Le fichier de configuration est invalide : /home/ada/.config/reqraft/config.json.",
    },
  },
  {
    kind: "an invalid configuration value",
    error: failure("config.value_invalid", { key: "timeoutMs", expected: "positive integer" }),
    en: { title: "Error", message: "Invalid value for timeoutMs. Expected: positive integer." },
    fr: {
      title: "Erreur",
      message: "Valeur invalide pour timeoutMs. Valeur attendue : positive integer.",
    },
  },
  {
    kind: "an invalid --timeout option",
    error: failure("runtime.option_invalid", { option: "timeout", expected: "positive_integer" }),
    en: { title: "Error", message: "The timeout must be a strictly positive integer." },
    fr: { title: "Erreur", message: "Le timeout doit être un entier strictement positif." },
  },
  {
    kind: "an invalid --max-output-tokens option",
    error: failure("runtime.option_invalid", {
      option: "maxOutputTokens",
      expected: "positive_integer",
    }),
    en: { title: "Error", message: "The output limit must be a strictly positive integer." },
    fr: {
      title: "Erreur",
      message: "La limite de sortie doit être un entier strictement positif.",
    },
  },
  {
    kind: "an empty alias name",
    error: failure("alias.name_empty"),
    en: { title: "Error", message: "The alias name cannot be empty." },
    fr: { title: "Erreur", message: "Le nom de l'alias ne peut pas être vide." },
  },
  {
    kind: "an alias name with invalid characters",
    error: failure("alias.name_invalid", { name: "rp;rm" }),
    en: { title: "Error", message: "The alias name “rp;rm” contains invalid characters." },
    fr: { title: "Erreur", message: "Le nom d'alias « rp;rm » contient des caractères invalides." },
  },
  {
    kind: "a reserved alias name",
    error: failure("alias.name_reserved", { name: "ls" }),
    en: { title: "Error", message: "The alias name “ls” is reserved or unsafe." },
    fr: { title: "Erreur", message: "Le nom d'alias « ls » est réservé ou dangereux." },
  },
  {
    kind: "an alias that already exists",
    error: failure("alias.exists", { name: "rr", path: "~/.zshrc" }),
    en: { title: "Error", message: "The alias “rr” already exists in ~/.zshrc." },
    fr: { title: "Erreur", message: "L'alias « rr » existe déjà dans ~/.zshrc." },
  },
  {
    kind: "an alias that does not exist",
    error: failure("alias.not_found", { name: "rr", path: "~/.zshrc" }),
    en: { title: "Error", message: "The alias “rr” does not exist in ~/.zshrc." },
    fr: { title: "Erreur", message: "L'alias « rr » n'existe pas dans ~/.zshrc." },
  },
  {
    kind: "an unknown profile",
    error: failure("profile.unknown", { profile: "poetry" }),
    en: { title: "Error", message: "Unknown profile: poetry." },
    fr: { title: "Erreur", message: "Profil inconnu : poetry." },
  },
  {
    kind: "an invalid level",
    error: failure("level.invalid", { level: "max", allowed: ["minimal", "standard", "complete"] }),
    en: { title: "Error", message: "Invalid level: max. Choose minimal, standard or complete." },
    fr: {
      title: "Erreur",
      message: "Niveau invalide : max. Choisissez minimal, standard ou complete.",
    },
  },
  {
    kind: "an unsupported provider",
    error: failure("provider.unsupported", { provider: "gemini" }),
    en: { title: "Error", message: "Unsupported provider: gemini." },
    fr: { title: "Erreur", message: "Provider non supporté : gemini." },
  },
  {
    kind: "a placeholder key in the environment",
    error: failure("credential.placeholder", { envName: "OPENAI_API_KEY" }),
    en: {
      title: "Error",
      message:
        "OPENAI_API_KEY contains an invalid placeholder. Correct or remove it before restarting Reqraft.",
    },
    fr: {
      title: "Erreur",
      message:
        "OPENAI_API_KEY contient une valeur d’exemple invalide. Corrige-la ou supprime-la avant de relancer Reqraft.",
    },
  },
  {
    kind: "a placeholder key typed at login",
    error: failure("credential.placeholder"),
    en: { title: "Error", message: "This value looks like a placeholder, not a real API key." },
    fr: {
      title: "Erreur",
      message: "Cette valeur ressemble à un exemple, pas à une véritable clé API.",
    },
  },
  {
    kind: "an unavailable secure storage",
    error: failure("credential.storage_unavailable", { provider: "mistral" }),
    en: {
      title: "Error",
      message:
        "Secure credential storage is unavailable for mistral. Use its environment variable instead.",
    },
    fr: {
      title: "Erreur",
      message:
        "Le stockage sécurisé n'est pas disponible pour mistral. Utilisez plutôt sa variable d'environnement.",
    },
  },
  {
    kind: "an unexpected failure",
    error: new TypeError("Cannot read properties of undefined (reading 'choices')"),
    en: { title: "Error", message: "An unexpected error occurred." },
    fr: { title: "Erreur", message: "Une erreur inattendue est survenue." },
  },
  {
    kind: "an unclassified internal error",
    error: normalizeReqraftError(new Error("EPIPE: broken pipe")),
    en: { title: "Error", message: "An unexpected error occurred." },
    fr: { title: "Erreur", message: "Une erreur inattendue est survenue." },
  },
];

describe("user-facing errors", () => {
  describe.each(ERROR_KINDS)("$kind", ({ error, en: inEnglish, fr: inFrench }) => {
    it("reads in English", () => {
      expect(describeUiError(error, "openai", en)).toEqual(inEnglish);
    });

    it("reads in French", () => {
      expect(describeUiError(error, "openai", fr)).toEqual(inFrench);
    });
  });

  it.each([400, 401, 402, 403, 404, 429, 500, 503])(
    "keeps the provider's response body out of an HTTP %i error",
    (status) => {
      for (const t of [en, fr]) {
        const shown = JSON.stringify(describeUiError(httpFailure(status), "openai", t));
        expect(shown).not.toContain("sk-proj-leaked");
        expect(shown).not.toContain("Incorrect API key");
      }
    },
  );

  it("still recognises the HTTP status of an error that lost its type", () => {
    const legacy = new Error("Provider error 503: upstream connect error");

    expect(describeUiError(legacy, "mistral", en)).toEqual({
      title: "Provider unavailable",
      message: "mistral is temporarily unavailable.",
      nextAction: "Try again in a few moments.",
    });
  });

  it("describes a rejection that is not an Error without repeating it", () => {
    expect(describeUiError("socket hang up", "openai", en)).toEqual({
      title: "Error",
      message: "An unexpected error occurred.",
    });
  });

  it("speaks French when no translator is given", () => {
    expect(describeUiError(httpFailure(429), "openai")).toEqual({
      title: "Limite de requêtes atteinte",
      message: "openai limite temporairement les requêtes.",
      nextAction: "Patiente quelques secondes puis régénère.",
    });
    expect(formatUiError(new RequestCancelledError(), "openai")).toBe("Génération interrompue.");
  });
});

describe("single-line errors", () => {
  it("puts the message and the next action on one line", () => {
    expect(formatUiError(httpFailure(402), "openai", en)).toBe(
      "The openai account has no credit left. Add provider credit before trying again.",
    );
  });

  it("shows only the message when there is no next action", () => {
    expect(formatUiError(new RequestTimeoutError(30_000), "openai", en)).toBe(
      "The provider did not respond within 30000 ms.",
    );
  });
});

describe("errors that reach the top of the CLI", () => {
  // `rp auth login openai` with a rejected key ends there, with no run around
  // it to say which provider was called.
  it("name the provider the failure came from", () => {
    const rejected = httpFailure(401);

    expect(providerNamedBy(rejected)).toBe("openai");
    expect(formatUiError(rejected, providerNamedBy(rejected) ?? "provider", fr)).toBe(
      "La clé API openai a été refusée. Lance « rp auth login openai » ou vérifie la variable d’environnement correspondante.",
    );
  });

  it("name no provider for a failure that carries none", () => {
    expect(providerNamedBy(new RequestTimeoutError(30_000))).toBeUndefined();
    expect(providerNamedBy(new Error("socket hang up"))).toBeUndefined();
  });
});
