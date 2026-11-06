// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { ModelsTab } from "@/apps/desktop/renderer/settings/ModelsTab.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import type {
  ConfigWriteRequest,
  ModelCatalogEntry,
  ModelsListResponse,
  ProviderStatus,
  ReqraftBridge,
  SafeConfig,
} from "@/apps/desktop/shared/ipc-contract.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { DESKTOP_EN as EN } from "@/i18n/desktop/en.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

/**
 * L'onglet Modèles, rendu pour de vrai.
 *
 * `desktop-models-tab.test.ts` vérifie ses règles une à une. Ici l'onglet est
 * monté avec un faux pont dont on tient les réponses : on ouvre les listes, on
 * tape dans le champ, et ce qui est vérifié est ce que la personne lit et ce
 * que l'onglet demande d'enregistrer.
 */

afterEach(cleanup);

const t = createDesktopTranslator("en");

type ListModels = ReqraftBridge["listModels"];

const SONNET: ModelCatalogEntry = { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" };
const HAIKU: ModelCatalogEntry = { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" };
const GPT: ModelCatalogEntry = { id: "gpt-5.1", name: "GPT-5.1" };
const MISTRAL: ModelCatalogEntry = { id: "mistral-large-latest", name: "Mistral Large" };

function provider(
  id: ProviderStatus["id"],
  label: string,
  models: [string, boolean][],
): ProviderStatus {
  return {
    id,
    label,
    configured: true,
    source: "environment",
    requiresApiKey: id !== "openai-compatible",
    supportsSecureAuth: true,
    models: models.map(([modelId, recommended]) => ({
      id: modelId,
      name: modelId,
      description: "",
      recommended,
    })),
  };
}

const PROVIDERS: ProviderStatus[] = [
  provider("anthropic", "Anthropic", [
    [SONNET.id, true],
    [HAIKU.id, false],
  ]),
  provider("openai", "OpenAI", [
    ["gpt-4.1-mini", false],
    [GPT.id, true],
  ]),
  provider("mistral", "Mistral", [[MISTRAL.id, true]]),
  provider("openai-compatible", "OpenAI Compatible", []),
];

function config(overrides: Partial<SafeConfig> = {}): SafeConfig {
  return {
    ...DEFAULT_CONFIG,
    defaultProvider: "anthropic",
    defaultModel: SONNET.id,
    defaultLevel: "standard",
    ...overrides,
  };
}

function catalogue(
  models: ModelCatalogEntry[],
  extra: Partial<ModelsListResponse> = {},
): ModelsListResponse {
  return { id: "anthropic", outcome: "ok", models, truncated: false, ...extra };
}

function ready(count: number): string {
  return t("settings.modelCatalogReady", { count: String(count) });
}

/** Une macrotâche : tout ce qui s'enchaîne sur une réponse a eu lieu. */
function settled(): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, 0);
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => Promise<void>;
  reject: (reason: Error) => Promise<void>;
}

/** Une réponse du pont que le test libère quand il le décide. */
function deferred<T>(): Deferred<T> {
  let settle: { resolve: (value: T) => void; reject: (reason: Error) => void } | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return {
    promise,
    resolve: async (value) => {
      settle?.resolve(value);
      await settled();
    },
    reject: async (reason) => {
      settle?.reject(reason);
      await settled();
    },
  };
}

interface ModelsHarness {
  listModels: Mock<ListModels>;
  onPatchConfig: Mock<(patch: ConfigWriteRequest) => void>;
  user: UserEvent;
  /** Ce que l'onglet reçoit quand la configuration enregistrée change. */
  showConfig: (next: SafeConfig) => void;
}

function renderTab(
  options: { config?: SafeConfig; listModels?: Mock<ListModels> } = {},
): ModelsHarness {
  const listModels =
    options.listModels ?? vi.fn<ListModels>(() => Promise.resolve(catalogue([SONNET, HAIKU])));
  const bridge: Pick<ReqraftBridge, "platform" | "readLocale" | "listModels"> = {
    platform: "darwin",
    readLocale: () => Promise.resolve({ locale: "en", messages: EN }),
    listModels,
  };
  window.reqraft = bridge as ReqraftBridge;
  const onPatchConfig = vi.fn<(patch: ConfigWriteRequest) => void>();
  const tab = (current: SafeConfig): React.JSX.Element => (
    <TranslationProvider>
      <ModelsTab config={current} providers={PROVIDERS} onPatchConfig={onPatchConfig} />
    </TranslationProvider>
  );
  const view = render(tab(options.config ?? config()));
  return {
    listModels,
    onPatchConfig,
    user: userEvent.setup(),
    showConfig: (next) => {
      view.rerender(tab(next));
    },
  };
}

function combobox(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("combobox", { name });
}

function modelSelect(): HTMLButtonElement {
  return combobox(EN["settings.defaultModel"]);
}

function modelIdField(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", {
    name: (name) => name.startsWith(EN["settings.modelId"]),
  });
}

function refreshButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name: EN["settings.refreshModels"] });
}

function optionLabels(): (string | null)[] {
  return screen.getAllByRole("option").map((option) => option.textContent);
}

describe("ModelsTab — le catalogue du fournisseur", () => {
  it("attend le catalogue sans laisser relancer, puis l'annonce", async () => {
    const answer = deferred<ModelsListResponse>();
    const { listModels } = renderTab({
      listModels: vi.fn<ListModels>(() => answer.promise),
    });

    expect(await screen.findByText(EN["settings.modelCatalogLoading"])).toBeTruthy();
    expect(listModels).toHaveBeenCalledWith({ kind: "builtin", id: "anthropic" });
    expect(refreshButton().disabled).toBe(true);
    expect(refreshButton().getAttribute("aria-busy")).toBe("true");
    expect(modelSelect().disabled).toBe(true);

    await act(() => answer.resolve(catalogue([SONNET, HAIKU])));

    expect(screen.getByText(ready(2))).toBeTruthy();
    expect(refreshButton().disabled).toBe(false);
    expect(modelSelect().disabled).toBe(false);
  });

  it("enregistre le modèle choisi dans le catalogue", async () => {
    const { onPatchConfig, user } = renderTab();
    await screen.findByText(ready(2));

    expect(modelSelect().textContent).toBe(SONNET.name);
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(modelSelect());
    expect(optionLabels()).toEqual([SONNET.name, HAIKU.name, EN["settings.otherModel"]]);
    await user.click(screen.getByRole("option", { name: HAIKU.name }));

    expect(onPatchConfig).toHaveBeenCalledWith({ defaultModel: HAIKU.id });
  });

  it("ouvre un champ libre pour un identifiant que la liste n'a pas", async () => {
    const { onPatchConfig, user } = renderTab();
    await screen.findByText(ready(2));

    await user.click(modelSelect());
    await user.click(screen.getByRole("option", { name: EN["settings.otherModel"] }));

    expect(onPatchConfig).not.toHaveBeenCalled();
    expect(modelIdField().value).toBe(SONNET.id);

    await user.clear(modelIdField());
    await user.type(modelIdField(), "claude-opus-4-1");
    await user.tab();

    expect(onPatchConfig).toHaveBeenCalledTimes(1);
    expect(onPatchConfig).toHaveBeenCalledWith({ defaultModel: "claude-opus-4-1" });
  });

  it("garde dans le champ libre un identifiant absent du catalogue", async () => {
    const { onPatchConfig, user } = renderTab({
      config: config({ defaultModel: "claude-custom-finetune" }),
    });
    await screen.findByText(ready(2));

    expect(modelSelect().textContent).toBe(EN["settings.otherModel"]);
    expect(modelIdField().value).toBe("claude-custom-finetune");

    // Quitter le champ sans rien changer n'est pas une modification.
    await user.click(modelIdField());
    await user.tab();
    expect(onPatchConfig).not.toHaveBeenCalled();
  });

  it("annonce un catalogue raccourci par le fournisseur", async () => {
    renderTab({
      listModels: vi.fn<ListModels>(() =>
        Promise.resolve(catalogue([SONNET, HAIKU], { truncated: true })),
      ),
    });

    expect(
      await screen.findByText(t("settings.modelCatalogReadyTruncated", { count: "2" })),
    ).toBeTruthy();
    expect(modelSelect().disabled).toBe(false);
  });

  it.each([
    {
      cas: "un catalogue vide",
      response: catalogue([]),
      message: EN["settings.modelCatalogEmpty"],
    },
    {
      cas: "un fournisseur sans catalogue",
      response: catalogue([], { id: "mock", outcome: "unsupported" }),
      message: EN["settings.modelCatalogUnsupported"],
    },
    {
      cas: "une clé manquante",
      response: catalogue([], { outcome: "missing_configuration", missing: ["ANTHROPIC_API_KEY"] }),
      message: t("settings.modelCatalogMissing", { list: "ANTHROPIC_API_KEY" }),
    },
    {
      cas: "une configuration incomplète sans détail",
      response: catalogue([], { outcome: "missing_configuration" }),
      message: EN["settings.modelCatalogMissingUnknown"],
    },
    {
      cas: "un fournisseur injoignable",
      response: catalogue([], { outcome: "unreachable" }),
      message: EN["settings.modelCatalogError"],
    },
  ])("laisse saisir l'identifiant devant $cas", async ({ response, message }) => {
    renderTab({ listModels: vi.fn<ListModels>(() => Promise.resolve(response)) });

    expect(await screen.findByText(message)).toBeTruthy();
    expect(modelSelect().disabled).toBe(true);
    expect(modelIdField().value).toBe(SONNET.id);
  });

  it("dit que le catalogue est indisponible, puis le recharge à la demande", async () => {
    const listModels = vi
      .fn<ListModels>()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue(catalogue([SONNET, HAIKU]));
    const { user } = renderTab({ listModels });

    expect(await screen.findByText(EN["settings.modelCatalogError"])).toBeTruthy();
    expect(modelIdField().value).toBe(SONNET.id);

    await user.click(refreshButton());

    expect(await screen.findByText(ready(2))).toBeTruthy();
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  it("demande le catalogue du premier endpoint déclaré", async () => {
    const { listModels } = renderTab({
      config: config({
        defaultProvider: "openai-compatible",
        defaultModel: "llama3.1",
        providers: {
          local: {
            type: "openai-compatible",
            name: "Local",
            baseUrl: "https://llm.example.test/v1",
          },
          labo: { type: "openai-compatible", baseUrl: "https://labo.example.test/v1" },
        },
      }),
    });

    await screen.findByText(ready(2));
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(listModels).toHaveBeenCalledWith({ kind: "endpoint", id: "local" });
  });

  it("demande d'abord un endpoint quand openai-compatible n'en a aucun", async () => {
    const { listModels, user } = renderTab({
      config: config({ defaultProvider: "openai-compatible", defaultModel: "llama3.1" }),
    });

    expect(await screen.findByText(EN["settings.modelCatalogNoEndpoint"])).toBeTruthy();
    expect(modelIdField().value).toBe("llama3.1");

    await user.click(refreshButton());
    expect(listModels).not.toHaveBeenCalled();
  });

  it("n'affiche que le catalogue du dernier fournisseur, dans quelque ordre qu'arrivent les réponses", async () => {
    const answers = new Map<string, Deferred<ModelsListResponse>>();
    const listModels = vi.fn<ListModels>((request) => {
      const answer = deferred<ModelsListResponse>();
      answers.set(request.id, answer);
      return answer.promise;
    });
    const answerFor = (id: string): Deferred<ModelsListResponse> => {
      const answer = answers.get(id);
      if (answer === undefined) throw new Error(`Aucune demande de catalogue pour ${id}`);
      return answer;
    };
    const { showConfig } = renderTab({ listModels });
    await screen.findByText(EN["settings.modelCatalogLoading"]);

    showConfig(config({ defaultProvider: "openai", defaultModel: GPT.id }));
    showConfig(config({ defaultProvider: "mistral", defaultModel: MISTRAL.id }));
    expect(listModels).toHaveBeenCalledTimes(3);

    await act(() => answerFor("mistral").resolve(catalogue([MISTRAL], { id: "mistral" })));
    await act(() => answerFor("anthropic").resolve(catalogue([SONNET, HAIKU])));
    await act(() => answerFor("openai").reject(new Error("timeout")));

    expect(screen.getByText(ready(1))).toBeTruthy();
    expect(modelSelect().textContent).toBe(MISTRAL.name);
    expect(screen.queryByText(EN["settings.modelCatalogError"])).toBeNull();
  });
});

describe("ModelsTab — fournisseur et niveau par défaut", () => {
  it("liste les fournisseurs par leur nom", async () => {
    const { user } = renderTab();
    await screen.findByText(ready(2));

    expect(combobox(EN["settings.defaultProvider"]).textContent).toBe("Anthropic");
    await user.click(combobox(EN["settings.defaultProvider"]));

    expect(optionLabels()).toEqual(["Anthropic", "OpenAI", "Mistral", "OpenAI Compatible"]);
  });

  it.each([
    { cas: "son modèle recommandé", label: "OpenAI", id: "openai", model: GPT.id },
    {
      cas: "l'identifiant en place, faute de catalogue",
      label: "OpenAI Compatible",
      id: "openai-compatible",
      model: SONNET.id,
    },
  ])("change de fournisseur et prend $cas", async ({ label, id, model }) => {
    const { onPatchConfig, user } = renderTab();
    await screen.findByText(ready(2));

    await user.click(combobox(EN["settings.defaultProvider"]));
    await user.click(screen.getByRole("option", { name: label }));

    expect(onPatchConfig).toHaveBeenCalledWith({ defaultProvider: id, defaultModel: model });
  });

  it("enregistre le niveau de réécriture par défaut", async () => {
    const { onPatchConfig, user } = renderTab();
    await screen.findByText(ready(2));

    expect(combobox(EN["settings.defaultLevel"]).textContent).toBe("standard");
    await user.click(combobox(EN["settings.defaultLevel"]));
    expect(optionLabels()).toEqual(["minimal", "standard", "complete"]);
    await user.click(screen.getByRole("option", { name: "complete" }));

    expect(onPatchConfig).toHaveBeenCalledWith({ defaultLevel: "complete" });
  });
});
