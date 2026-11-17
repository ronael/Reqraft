import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRepromptInput, ExecuteRepromptResult } from "@/application/reprompt.js";
import { setMainLocale } from "@/apps/desktop/main/i18n.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type { RunErrorPayload } from "@/apps/desktop/shared/ipc-contract.js";
import { RequestTimeoutError } from "@/core/errors.js";
import { createDesktopTranslator, type DesktopMessageKey } from "@/i18n/desktop/index.js";
import type { UiLocale } from "@/i18n/locale.js";
import { ProviderError } from "@/providers/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { sentChannels, setup } from "./desktop-ipc-harness.js";

/**
 * Ce qu'une fenêtre conseille quand un run échoue.
 *
 * Le CLI renvoie vers `rp auth login` et `rp doctor`, des commandes qu'aucune
 * fenêtre ne lance. Le run échoue ici à travers le vrai contrat IPC, et ce que
 * l'on vérifie est la charge utile que la capsule et le popover reçoivent.
 */

/** Une commande du CLI, quelle que soit la typographie qui l'entoure. */
const CLI_COMMAND = /\brp\s/;

/** Le refus d'un fournisseur, tel que les adaptateurs le lèvent. */
function refusal(status: number, provider: string): ProviderError {
  return new ProviderError(
    `Provider error ${String(status)}: {"error":"refused"}`,
    EXIT_CODES.PROVIDER_NETWORK,
    undefined,
    { httpStatus: status, provider },
  );
}

async function runErrorFor(error: Error, providerId: string): Promise<RunErrorPayload> {
  const execute = vi.fn((_input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> =>
    Promise.reject(error),
  );
  const harness = setup({ execute });
  await harness.ipcMain.invoke(
    IPC_CHANNELS.repromptStart,
    { input: "demande", providerId },
    harness.sender,
  );
  await vi.waitFor(() => {
    expect(sentChannels(harness, IPC_CHANNELS.runError)).toHaveLength(1);
  });
  return sentChannels(harness, IPC_CHANNELS.runError)[0] as RunErrorPayload;
}

/** Le modèle qu'un serveur local n'a pas, tel que l'adaptateur compatible le lève. */
function missingModel(provider: string, server: "ollama" | "lmstudio"): ProviderError {
  return new ProviderError(
    "Model not found: qwen3.5:4b",
    EXIT_CODES.INVALID_CONFIGURATION,
    undefined,
    {
      httpStatus: 404,
      provider,
      errorCode: "provider.model_not_found",
      params: { model: "qwen3.5:4b", server },
    },
  );
}

const CASES: {
  cas: string;
  error: Error;
  providerId: string;
  advice: DesktopMessageKey;
  params?: Record<string, string>;
}[] = [
  {
    cas: "une clé refusée (401)",
    error: refusal(401, "openai"),
    providerId: "openai",
    advice: "main.keyRejectedAction",
  },
  {
    cas: "une clé interdite (403)",
    error: refusal(403, "anthropic"),
    providerId: "anthropic",
    advice: "main.keyRejectedAction",
  },
  {
    cas: "la clé refusée d'un endpoint compatible",
    error: refusal(401, "openai-compatible"),
    providerId: "openai-compatible",
    advice: "main.endpointKeyRejectedAction",
  },
  {
    cas: "une clé absente",
    error: new Error("Clé API OpenAI manquante : définis OPENAI_API_KEY."),
    providerId: "openai",
    advice: "main.keyMissingAction",
  },
  {
    cas: "une autre requête refusée (404)",
    error: refusal(404, "openai"),
    providerId: "openai",
    advice: "main.requestRejectedAction",
  },
  {
    cas: "un modèle qu'Ollama n'a pas",
    error: missingModel("Ollama", "ollama"),
    providerId: "openai-compatible",
    advice: "main.modelNotPulledAction",
    params: { model: "qwen3.5:4b" },
  },
  {
    cas: "un modèle qu'un autre serveur n'a pas",
    error: missingModel("LM Studio", "lmstudio"),
    providerId: "openai-compatible",
    advice: "main.modelNotInstalledAction",
  },
  {
    cas: "un modèle local qui ne commence pas à répondre",
    error: new RequestTimeoutError(30_000, "first_token"),
    providerId: "openai-compatible",
    advice: "main.localModelSilentAction",
  },
];

describe.each<UiLocale>(["en", "fr"])("l'échec d'un fournisseur, en %s", (locale) => {
  beforeEach(() => {
    setMainLocale(locale);
  });

  afterEach(() => {
    setMainLocale("en");
  });

  it.each(CASES)(
    "$cas renvoie vers les réglages, jamais vers le CLI",
    async ({ error, providerId, advice, params }) => {
      const payload = await runErrorFor(error, providerId);

      expect(payload.error.nextAction).toBe(createDesktopTranslator(locale)(advice, params));
      expect(JSON.stringify(payload)).not.toMatch(CLI_COMMAND);
    },
  );
});

describe("le conseil d'un modèle absent d'Ollama", () => {
  afterEach(() => {
    setMainLocale("en");
  });

  it("nomme la commande d'Ollama et l'onglet Modèles", async () => {
    setMainLocale("fr");

    const payload = await runErrorFor(missingModel("Ollama", "ollama"), "openai-compatible");

    expect(payload.error.nextAction).toBe(
      "Téléchargez-le avec « ollama pull qwen3.5:4b », ou choisissez un modèle installé dans Réglages\u00a0›\u00a0Modèles.",
    );
  });
});
