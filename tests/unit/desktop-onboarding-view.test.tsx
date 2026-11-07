// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { registerIpcHandlers, type IpcEventLike } from "@/apps/desktop/main/ipc.js";
import { OnboardingApp } from "@/apps/desktop/renderer/onboarding/OnboardingApp.js";
import { WELCOME_TOUR_SLIDES } from "@/apps/desktop/renderer/onboarding/WelcomeTour.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  CredentialSaveRequest,
  CredentialSaveResponse,
  OnboardingCompleteRequest,
  OnboardingProviderOption,
  OnboardingStateResponse,
  ProfileCatalogEntry,
  ReqraftBridge,
} from "@/apps/desktop/shared/ipc-contract.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { ConfigSchema } from "@/config/schema.js";
import { createDesktopTranslator, DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";
import { createTranslator } from "@/i18n/translate.js";
import { ProviderError } from "@/providers/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

/**
 * L'onboarding monté pour de vrai, avec le seul contact qu'il a avec le
 * dehors : `window.reqraft`.
 *
 * On choisit dans les menus, on tape la clé, on clique ; ce que l'on vérifie
 * est ce que la fenêtre affiche et ce que le pont reçoit, c'est-à-dire ce que
 * le processus principal enregistrerait. Les règles du formulaire prises une à
 * une sont couvertes par `desktop-onboarding-flow.test.ts`, le contrat IPC par
 * `desktop-onboarding-ipc.test.ts`.
 */

const t = createDesktopTranslator("en");
const fr = createDesktopTranslator("fr");
/** Le catalogue partagé, où le processus principal prend les erreurs des fournisseurs. */
const tPartage = createTranslator("en");

const CLE = "sk-ant-not-a-real-key-1234567890";
const LIBELLE_CLE = t("onboarding.apiKey", { provider: "Anthropic" });

const ANTHROPIC: OnboardingProviderOption = {
  id: "anthropic",
  label: "Anthropic",
  requiresApiKey: true,
  envName: "ANTHROPIC_API_KEY",
  supportsSecureAuth: true,
  credentialConfigured: false,
  credentialSource: "not_configured",
  models: [
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", description: "", recommended: true },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", description: "", recommended: false },
  ],
};

/** Sa clé est déjà exportée dans le shell ; le modèle recommandé n'est pas le premier. */
const OPENAI: OnboardingProviderOption = {
  id: "openai",
  label: "OpenAI",
  requiresApiKey: true,
  envName: "OPENAI_API_KEY",
  supportsSecureAuth: true,
  credentialConfigured: true,
  credentialSource: "environment",
  models: [
    { id: "gpt-4o-mini", name: "GPT-4o mini", description: "", recommended: false },
    { id: "gpt-5.1", name: "GPT-5.1", description: "", recommended: true },
  ],
};

/** Aucun modèle n'y est recommandé. */
const DEEPSEEK: OnboardingProviderOption = {
  id: "deepseek",
  label: "DeepSeek",
  requiresApiKey: true,
  envName: "DEEPSEEK_API_KEY",
  supportsSecureAuth: true,
  credentialConfigured: true,
  credentialSource: "keychain",
  models: [
    { id: "deepseek-chat", name: "DeepSeek Chat", description: "", recommended: false },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", description: "", recommended: false },
  ],
};

/** Un serveur local : ni clé, ni catalogue de modèles. */
const COMPATIBLE: OnboardingProviderOption = {
  id: "openai-compatible",
  label: "OpenAI Compatible",
  requiresApiKey: false,
  supportsSecureAuth: false,
  credentialConfigured: false,
  credentialSource: "not_configured",
  models: [],
};

/** Les fournisseurs proposés, Anthropic dans la variante donnée. */
function fournisseurs(
  anthropic: Partial<OnboardingProviderOption> = {},
): OnboardingProviderOption[] {
  return [{ ...ANTHROPIC, ...anthropic }, OPENAI, DEEPSEEK, COMPATIBLE];
}

/** Par défaut, une machine vierge : Anthropic proposé, sans clé. */
function etat(overrides: Partial<OnboardingStateResponse> = {}): OnboardingStateResponse {
  return {
    required: true,
    welcomeTourRequired: false,
    blocker: "config_missing",
    providers: fournisseurs(),
    suggested: {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      profile: "auto",
      level: "standard",
    },
    ...overrides,
  };
}

/** La clé Anthropic est dans le stockage sécurisé : plus rien ne bloque. */
const CLE_ENREGISTREE = etat({
  providers: fournisseurs({ credentialConfigured: true, credentialSource: "keychain" }),
});

/** Ce que le processus principal relit après un enregistrement qui aboutit. */
const INSTALLATION_UTILISABLE: OnboardingStateResponse = {
  ...CLE_ENREGISTREE,
  required: false,
  blocker: undefined,
};

const PROFILS: ProfileCatalogEntry[] = [
  { id: "auto", name: "Auto", description: "Detects the context", origin: "auto" },
  { id: "clean", name: "Clean", description: "Spelling and grammar", origin: "builtin" },
  { id: "team-style", name: "Team style", description: "Our house rules", origin: "local" },
];

/** Ce que `onboarding:complete` rend aussi ; la fenêtre ne s'en sert pas. */
const CONFIG_ENREGISTREE = ConfigSchema.parse({});

/** Les fonctions du pont que l'onboarding touche, espionnées. */
interface FauxPont {
  readonly readLocale: Mock<ReqraftBridge["readLocale"]>;
  readonly profileCatalog: Mock<ReqraftBridge["profileCatalog"]>;
  readonly onboardingState: Mock<ReqraftBridge["onboardingState"]>;
  readonly completeWelcomeTour: Mock<ReqraftBridge["completeWelcomeTour"]>;
  readonly saveCredential: Mock<ReqraftBridge["saveCredential"]>;
  readonly completeOnboarding: Mock<ReqraftBridge["completeOnboarding"]>;
}

interface OptionsPont {
  /** Ce que la première lecture de `onboarding:state` rend, ou comment elle échoue. */
  readonly etatInitial?: OnboardingStateResponse | (() => Promise<OnboardingStateResponse>);
  /** Le catalogue de profils, ou l'erreur qui empêche de le lire. */
  readonly profils?: readonly ProfileCatalogEntry[] | Error;
}

interface Montage {
  readonly pont: FauxPont;
  readonly user: UserEvent;
}

/** Un appel au pont qui ne répond jamais : la fenêtre reste dans son état d'attente. */
function jamais(): Promise<never> {
  return new Promise<never>(() => undefined);
}

/**
 * Un rejet tel qu'Electron le rend au renderer.
 *
 * Le processus principal sérialise l'erreur par `toString()`, puis
 * `ipcRenderer.invoke` la préfixe du nom du canal : c'est ce cadre que la
 * fenêtre doit retirer avant d'afficher la phrase.
 */
function rejetIpc(canal: string, phrase: string): Error {
  return new Error(`Error invoking remote method '${canal}': Error: ${phrase}`);
}

/**
 * `credential:save` tel que le vrai processus principal y répond quand la
 * vérification de la clé échoue sur `refus`.
 *
 * Le handler est celui de `main/ipc.ts` ; seuls le trousseau et le réseau sont
 * remplacés, par l'erreur que la vérification lève. Son rejet revient comme
 * Electron le rend : `toString()` de l'erreur, précédé du cadre IPC.
 */
async function enregistrerCleRefusee(
  requete: CredentialSaveRequest,
  refus: Error,
): Promise<CredentialSaveResponse> {
  const handlers = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();
  registerIpcHandlers({
    ipcMain: {
      handle: (canal, handler) => {
        handlers.set(canal, handler);
      },
    },
    clipboard: { writeText: () => undefined },
    env: {},
    secureCredentialStorageAvailable: true,
    loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
    saveConfig: () => Promise.resolve(),
    hydrateCredentials: () => Promise.resolve(),
    configFileExists: () => false,
    storeCredential: () => Promise.reject(refus),
  });
  const handler = handlers.get(IPC_CHANNELS.credentialSave);
  if (handler === undefined) throw new Error("credential:save n'est pas enregistré");
  try {
    return (await handler(
      { sender: { send: () => undefined, isDestroyed: () => false } },
      requete,
    )) as CredentialSaveResponse;
  } catch (erreur) {
    throw new Error(
      `Error invoking remote method '${IPC_CHANNELS.credentialSave}': ${String(erreur)}`,
      { cause: erreur },
    );
  }
}

function installerPont(options: OptionsPont): FauxPont {
  const { etatInitial = etat(), profils = PROFILS } = options;
  const lireEtat =
    typeof etatInitial === "function" ? etatInitial : () => Promise.resolve(etatInitial);
  const pont: FauxPont = {
    readLocale: vi.fn<ReqraftBridge["readLocale"]>((locale = "en") =>
      Promise.resolve({ locale, messages: DESKTOP_MESSAGES[locale] }),
    ),
    profileCatalog: vi.fn<ReqraftBridge["profileCatalog"]>(() =>
      profils instanceof Error
        ? Promise.reject(profils)
        : Promise.resolve({ entries: [...profils], problems: [] }),
    ),
    onboardingState: vi.fn<ReqraftBridge["onboardingState"]>(lireEtat),
    completeWelcomeTour: vi.fn<ReqraftBridge["completeWelcomeTour"]>(() => Promise.resolve(etat())),
    saveCredential: vi.fn<ReqraftBridge["saveCredential"]>(() =>
      Promise.resolve({ providers: [] }),
    ),
    completeOnboarding: vi.fn<ReqraftBridge["completeOnboarding"]>(() =>
      Promise.resolve({ config: CONFIG_ENREGISTREE, state: INSTALLATION_UTILISABLE }),
    ),
  };
  // Le pont réel porte une quarantaine de fonctions ; l'onboarding en touche
  // six. Les autres restent absentes : un appel inattendu doit échouer
  // bruyamment, pas rendre `undefined`.
  window.reqraft = { platform: "darwin", ...pont } as unknown as ReqraftBridge;
  return pont;
}

function monterOnboarding(options: OptionsPont = {}): Montage {
  const pont = installerPont(options);
  render(
    <TranslationProvider>
      <OnboardingApp />
    </TranslationProvider>,
  );
  return { pont, user: userEvent.setup() };
}

/**
 * Monte l'onboarding et attend le formulaire.
 *
 * Les libellés arrivent du processus principal par `readLocale`, après le
 * premier rendu : attendre le titre traduit, c'est attendre à la fois l'état
 * et les libellés.
 */
async function ouvrirFormulaire(options: OptionsPont = {}): Promise<Montage> {
  const montage = monterOnboarding(options);
  await screen.findByRole("heading", { name: t("onboarding.title") });
  return montage;
}

/** Le nom d'un champ commence par son titre ; le détail qui le suit en fait aussi partie. */
function commencePar(titre: string): (nom: string) => boolean {
  return (nom) => nom.startsWith(titre);
}

function menu(titre: string): Promise<HTMLElement> {
  return screen.findByRole("combobox", { name: commencePar(titre) });
}

async function choisir(user: UserEvent, titre: string, option: string): Promise<void> {
  await user.click(await menu(titre));
  await user.click(screen.getByRole("option", { name: option }));
}

function bouton(nom: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name: nom });
}

function champTexte(titre: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: commencePar(titre) });
}

/** Un champ mot de passe n'a pas de rôle ARIA : il se trouve par son libellé. */
function champCle(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(LIBELLE_CLE, { exact: false });
}

function texteDe(role: "alert" | "status"): string {
  return screen.getByRole(role).textContent.trim();
}

/** Clique sur « Terminer » et rend ce que le pont a reçu. */
async function terminer(
  { pont, user }: Montage,
  libelle = t("onboarding.finish"),
): Promise<OnboardingCompleteRequest | undefined> {
  await user.click(bouton(libelle));
  await waitFor(() => {
    expect(pont.completeOnboarding).toHaveBeenCalledTimes(1);
  });
  return pont.completeOnboarding.mock.calls[0]?.[0];
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("l'ouverture de l'onboarding", () => {
  it("dit qu'il lit la configuration tant qu'elle n'est pas arrivée", async () => {
    monterOnboarding({ etatInitial: jamais });

    expect(await screen.findByText(t("onboarding.loading"))).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explique, sans le cadre IPC, pourquoi la configuration est illisible", async () => {
    const raison = "The configuration file is invalid: config.json.";
    monterOnboarding({ etatInitial: () => Promise.reject(rejetIpc("onboarding:state", raison)) });

    await waitFor(() => {
      expect(texteDe("alert")).toBe(t("onboarding.unreadable", { reason: raison }));
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("s'ouvre quand même si le catalogue de profils est illisible", async () => {
    const montage = await ouvrirFormulaire({
      etatInitial: CLE_ENREGISTREE,
      profils: new Error("profiles/broken.yaml: invalid"),
    });

    expect(
      screen.queryByRole("combobox", { name: commencePar(t("onboarding.defaultProfile")) }),
    ).toBeNull();
    expect((await terminer(montage))?.profile).toBe("auto");
  });
});

describe("la langue", () => {
  it("passe la fenêtre en français dès qu'on le choisit, et l'enregistre avec le reste", async () => {
    const montage = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });

    await choisir(montage.user, t("onboarding.language"), t("settings.languageFr"));

    expect(await screen.findByRole("heading", { name: fr("onboarding.title") })).toBeTruthy();
    expect(montage.pont.readLocale).toHaveBeenLastCalledWith("fr");
    expect((await menu(fr("onboarding.language"))).textContent).toBe(fr("settings.languageFr"));
    expect((await terminer(montage, fr("onboarding.finish")))?.uiLocale).toBe("fr");
  });
});

describe("le choix du fournisseur", () => {
  it("dit d'où vient la clé, et ne la redemande pas quand elle existe déjà", async () => {
    const { user } = await ouvrirFormulaire();

    expect(screen.getByText(t("onboarding.noKeyYet"))).toBeTruthy();
    expect(champCle()).toBeTruthy();

    await choisir(user, t("onboarding.provider"), "OpenAI");

    expect(
      screen.getByText(t("onboarding.keyFromEnv", { envName: "OPENAI_API_KEY" })),
    ).toBeTruthy();
    expect(screen.queryByLabelText(LIBELLE_CLE, { exact: false })).toBeNull();
    expect(screen.getByText(t("onboarding.ready"))).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(false);
  });

  it.each([
    ["OpenAI", "openai", `GPT-5.1${t("common.recommendedSuffix")}`, "gpt-5.1"],
    ["DeepSeek", "deepseek", "DeepSeek Chat", "deepseek-chat"],
  ])(
    "fait suivre le modèle quand on passe à %s : le recommandé, sinon le premier",
    async (fournisseur, id, modeleAffiche, modeleEnvoye) => {
      const montage = await ouvrirFormulaire();

      await choisir(montage.user, t("onboarding.provider"), fournisseur);

      expect((await menu(t("onboarding.model"))).textContent).toBe(modeleAffiche);
      expect(await terminer(montage)).toMatchObject({ provider: id, model: modeleEnvoye });
    },
  );

  it("renvoie vers la variable d'environnement quand le stockage sécurisé manque", async () => {
    await ouvrirFormulaire({
      etatInitial: etat({ providers: fournisseurs({ supportsSecureAuth: false }) }),
    });

    expect(texteDe("status")).toBe(
      t("onboarding.secureStorageUnavailable", { envName: "ANTHROPIC_API_KEY" }),
    );
    expect(screen.queryByLabelText(LIBELLE_CLE, { exact: false })).toBeNull();
    expect(screen.getByText(t("onboarding.keyRequired", { provider: "Anthropic" }))).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(true);
  });
});

describe("la clé API", () => {
  it("ne propose la vérification qu'une fois une clé saisie", async () => {
    const { user } = await ouvrirFormulaire();
    const verifier = bouton(t("onboarding.verifyAndSave"));

    expect(verifier.disabled).toBe(true);
    await user.type(champCle(), "   ");
    expect(verifier.disabled).toBe(true);

    expect(screen.getByText(t("onboarding.keyRequired", { provider: "Anthropic" }))).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(true);
  });

  it("vérifie la clé, l'efface de l'écran et confirme qu'elle est enregistrée", async () => {
    const { pont, user } = await ouvrirFormulaire();
    // Ce que le processus principal relit une fois la clé rangée.
    pont.onboardingState.mockResolvedValue(CLE_ENREGISTREE);

    await user.type(champCle(), CLE);
    await user.click(bouton(t("onboarding.verifyAndSave")));

    await waitFor(() => {
      expect(texteDe("status")).toBe(t("onboarding.keySaved", { provider: "Anthropic" }));
    });
    // La clé part telle quelle, une seule fois, et rien d'autre avec elle.
    expect(pont.saveCredential.mock.calls).toStrictEqual([
      [{ provider: "anthropic", secret: CLE }],
    ]);
    expect(pont.onboardingState).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText(LIBELLE_CLE, { exact: false })).toBeNull();
    expect(document.body.innerHTML).not.toContain(CLE);
    expect(screen.getByText(t("onboarding.keyInKeychain"))).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(false);
  });

  it("ne lance pas deux vérifications à la fois", async () => {
    const { pont, user } = await ouvrirFormulaire();
    pont.saveCredential.mockReturnValue(jamais());

    await user.type(champCle(), CLE);
    const verifier = bouton(t("onboarding.verifyAndSave"));
    await user.click(verifier);
    await user.click(verifier);

    expect(verifier.disabled).toBe(true);
    expect(pont.saveCredential).toHaveBeenCalledTimes(1);
  });

  it("affiche le refus de la clé sans le cadre IPC, et la garde pour la corriger", async () => {
    const { pont, user } = await ouvrirFormulaire();
    const refus = "The Anthropic API key was rejected.";
    pont.saveCredential.mockRejectedValueOnce(rejetIpc("credential:save", refus));

    await user.type(champCle(), CLE);
    await user.click(bouton(t("onboarding.verifyAndSave")));

    await waitFor(() => {
      expect(texteDe("alert")).toBe(refus);
    });
    expect(champCle().value).toBe(CLE);
    expect(screen.queryByRole("status")).toBeNull();
    expect(pont.onboardingState).toHaveBeenCalledTimes(1);
    expect(bouton(t("onboarding.verifyAndSave")).disabled).toBe(false);
    expect(bouton(t("onboarding.finish")).disabled).toBe(true);
  });

  it("laisse réessayer après une panne réseau, et efface l'erreur quand ça passe", async () => {
    const { pont, user } = await ouvrirFormulaire();
    const panne =
      "Anthropic is unreachable. Check the network connection and provider base URL, then retry.";
    pont.saveCredential.mockRejectedValueOnce(rejetIpc("credential:save", panne));
    pont.onboardingState.mockResolvedValue(CLE_ENREGISTREE);

    await user.type(champCle(), CLE);
    await user.click(bouton(t("onboarding.verifyAndSave")));
    await waitFor(() => {
      expect(texteDe("alert")).toBe(panne);
    });

    await user.click(bouton(t("onboarding.verifyAndSave")));

    await waitFor(() => {
      expect(texteDe("status")).toBe(t("onboarding.keySaved", { provider: "Anthropic" }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pont.saveCredential).toHaveBeenCalledTimes(2);
  });

  // Electron sérialise un rejet par `toString()` : une `ProviderError` laissée
  // telle quelle arriverait en « ProviderError: Provider error 401: {corps
  // brut} » ou « ProviderError: provider.request_failed ».
  it.each([
    {
      cas: "une clé refusée",
      refus: new ProviderError(
        'Provider error 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
        EXIT_CODES.AUTHENTICATION,
        undefined,
        { httpStatus: 401, provider: "Anthropic" },
      ),
      phrase: tPartage("error.apiKeyRejected.message", { provider: "Anthropic" }),
    },
    {
      cas: "un fournisseur injoignable",
      refus: new ProviderError(
        "provider.request_failed",
        EXIT_CODES.PROVIDER_NETWORK,
        new TypeError("fetch failed"),
        { provider: "Anthropic" },
      ),
      phrase: tPartage("error.provider.network", { provider: "Anthropic" }),
    },
  ])(
    "explique en clair $cas, sans « ProviderError: » ni réponse brute",
    async ({ refus, phrase }) => {
      const { pont, user } = await ouvrirFormulaire();
      pont.saveCredential.mockImplementationOnce((requete) =>
        enregistrerCleRefusee(requete, refus),
      );

      await user.type(champCle(), CLE);
      await user.click(bouton(t("onboarding.verifyAndSave")));

      await waitFor(() => {
        expect(texteDe("alert")).toBe(phrase);
      });
      expect(document.body.textContent).not.toContain("ProviderError");
      expect(champCle().value).toBe(CLE);
    },
  );
});

describe("le choix du modèle", () => {
  it("signale le modèle recommandé et enregistre celui qu'on choisit", async () => {
    const montage = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });
    const recommande = `Claude Sonnet 4.5${t("common.recommendedSuffix")}`;

    expect((await menu(t("onboarding.model"))).textContent).toBe(recommande);
    await choisir(montage.user, t("onboarding.model"), "Claude Haiku 4.5");

    expect((await terminer(montage))?.model).toBe("claude-haiku-4-5");
  });

  it("garde un modèle hors catalogue venu de la configuration actuelle", async () => {
    const montage = await ouvrirFormulaire({
      etatInitial: {
        ...CLE_ENREGISTREE,
        suggested: { ...CLE_ENREGISTREE.suggested, model: "claude-x" },
      },
    });

    await montage.user.click(await menu(t("onboarding.model")));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toStrictEqual([
      `Claude Sonnet 4.5${t("common.recommendedSuffix")}`,
      "Claude Haiku 4.5",
      "claude-x",
    ]);
    await montage.user.keyboard("{Escape}");

    expect((await terminer(montage))?.model).toBe("claude-x");
  });
});

describe("un point d'accès compatible OpenAI", () => {
  /** Ouvre le formulaire sur un point d'accès compatible, modèle saisi : seuls ses champs restent. */
  async function choisirPointCompatible(): Promise<UserEvent> {
    const { user } = await ouvrirFormulaire();
    await choisir(user, t("onboarding.provider"), "OpenAI Compatible");
    await user.type(champTexte(t("onboarding.model")), "llama3.1");
    expect(screen.getByText(t("onboarding.ready"))).toBeTruthy();
    return user;
  }

  it("demande un modèle et une adresse, mais aucune clé", async () => {
    const montage = await ouvrirFormulaire();

    await choisir(montage.user, t("onboarding.provider"), "OpenAI Compatible");

    expect(screen.getByText(t("onboarding.keyNotNeededProvider"))).toBeTruthy();
    expect(screen.queryByLabelText(LIBELLE_CLE, { exact: false })).toBeNull();
    expect(champTexte(t("onboarding.internalId")).value).toBe("local");
    expect(champTexte(t("onboarding.baseUrl")).value).toBe("http://localhost:11434/v1");
    // Sans catalogue, le modèle se tape, dans un champ nommé comme le menu qu'il remplace.
    const modele = champTexte(t("onboarding.model"));
    expect(modele.placeholder).toBe(t("onboarding.modelPlaceholder"));
    expect(screen.getByText(t("onboarding.modelRequired"))).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(true);

    await montage.user.type(modele, "  llama3.1  ");

    expect(screen.getByText(t("onboarding.ready"))).toBeTruthy();
    expect(await terminer(montage)).toStrictEqual({
      provider: "openai-compatible",
      model: "llama3.1",
      profile: "auto",
      level: "standard",
      compatibleProvider: { id: "local", baseUrl: "http://localhost:11434/v1" },
    });
  });

  it("reconnaît un point d'accès déjà déclaré dans la configuration", async () => {
    const declare: OnboardingProviderOption = {
      ...COMPATIBLE,
      credentialConfigured: true,
      credentialSource: "config",
    };
    const { user } = await ouvrirFormulaire({
      etatInitial: etat({ providers: [ANTHROPIC, OPENAI, DEEPSEEK, declare] }),
    });

    await choisir(user, t("onboarding.provider"), "OpenAI Compatible");

    expect(screen.getByText(t("onboarding.providerDeclared"))).toBeTruthy();
  });

  it("réclame un identifiant quand on l'a effacé", async () => {
    const user = await choisirPointCompatible();

    await user.clear(champTexte(t("onboarding.internalId")));

    expect(screen.getByText(t("onboarding.idRequired"))).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(true);
  });

  it.each([
    [t("onboarding.internalId"), "Mon Serveur", t("onboarding.idFormat")],
    [t("onboarding.baseUrl"), "localhost:11434", t("settings.baseUrlScheme")],
  ])("refuse « %s » = « %s » et dit pourquoi à côté du bouton", async (champ, valeur, raison) => {
    const user = await choisirPointCompatible();

    await user.clear(champTexte(champ));
    await user.type(champTexte(champ), valeur);

    expect(screen.getByText(raison)).toBeTruthy();
    expect(bouton(t("onboarding.finish")).disabled).toBe(true);
  });
});

describe("le profil et le niveau", () => {
  it("enregistre le profil par défaut et le niveau choisis", async () => {
    const montage = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });

    await choisir(montage.user, t("onboarding.defaultProfile"), "Team style");
    await choisir(montage.user, t("onboarding.level"), t("onboarding.levelComplete"));

    expect(await terminer(montage)).toMatchObject({ profile: "team-style", level: "complete" });
  });
});

describe("la fin de la configuration", () => {
  it("enregistre les choix proposés tels quels, sans figer la langue détectée", async () => {
    const montage = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });

    expect(screen.getByText(t("onboarding.ready"))).toBeTruthy();
    // Ni `uiLocale` ni point d'accès : la langue continue de suivre le système.
    expect(await terminer(montage)).toStrictEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      profile: "auto",
      level: "standard",
    });
    await waitFor(() => {
      expect(bouton(t("onboarding.finish")).disabled).toBe(false);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dit ce qui manque encore quand l'installation reste inutilisable", async () => {
    const montage = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });
    montage.pont.completeOnboarding.mockResolvedValueOnce({
      config: CONFIG_ENREGISTREE,
      state: etat({ blocker: "credential_missing" }),
    });

    await terminer(montage);

    await waitFor(() => {
      expect(texteDe("alert")).toBe(t("onboarding.savedIncomplete"));
    });
  });

  it("affiche l'échec de l'enregistrement sans le cadre IPC, et laisse réessayer", async () => {
    const montage = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });
    const echec = "EACCES: permission denied, open 'config.json'";
    montage.pont.completeOnboarding.mockRejectedValueOnce(rejetIpc("onboarding:complete", echec));

    await terminer(montage);

    await waitFor(() => {
      expect(texteDe("alert")).toBe(echec);
    });
    expect(bouton(t("onboarding.finish")).disabled).toBe(false);
  });

  it("n'enregistre pas deux fois sur un double clic", async () => {
    const { pont, user } = await ouvrirFormulaire({ etatInitial: CLE_ENREGISTREE });
    pont.completeOnboarding.mockReturnValue(jamais());
    const fin = bouton(t("onboarding.finish"));

    await user.click(fin);
    await user.click(fin);

    expect(fin.disabled).toBe(true);
    expect(pont.completeOnboarding).toHaveBeenCalledTimes(1);
  });
});

describe("la visite de bienvenue avant le formulaire", () => {
  const PREMIER_ECRAN = t(WELCOME_TOUR_SLIDES[0].title);

  it("passe d'abord par la visite quand elle est due, puis ouvre le formulaire", async () => {
    const { pont, user } = monterOnboarding({ etatInitial: etat({ welcomeTourRequired: true }) });

    await screen.findByRole("heading", { name: PREMIER_ECRAN });
    expect(screen.queryByRole("heading", { name: t("onboarding.title") })).toBeNull();

    await user.click(bouton(t("onboarding.tour.skip")));

    expect(await screen.findByRole("heading", { name: t("onboarding.title") })).toBeTruthy();
    expect(pont.completeWelcomeTour).toHaveBeenCalledTimes(1);
  });

  it("rejoue la visite demandée depuis les réglages, même déjà faite", async () => {
    // Les réglages rouvrent cette fenêtre avec `tour=1`.
    window.history.replaceState(null, "", "/?surface=onboarding&tour=1");
    const { pont, user } = monterOnboarding({ etatInitial: CLE_ENREGISTREE });

    await screen.findByRole("heading", { name: PREMIER_ECRAN });
    await user.click(bouton(t("onboarding.tour.goTo", { step: "6" })));
    await user.click(bouton(t("onboarding.tour.configure")));

    expect(await screen.findByRole("heading", { name: t("onboarding.title") })).toBeTruthy();
    expect(pont.completeWelcomeTour).toHaveBeenCalledTimes(1);
  });

  it("dit pourquoi la visite n'a pas pu être enregistrée, sans erreur périmée ensuite", async () => {
    const echec = "EACCES: permission denied, open 'config.json'";
    const { pont, user } = monterOnboarding({ etatInitial: etat({ welcomeTourRequired: true }) });
    pont.completeWelcomeTour.mockRejectedValueOnce(
      rejetIpc(IPC_CHANNELS.onboardingTourComplete, echec),
    );
    await screen.findByRole("heading", { name: PREMIER_ECRAN });

    await user.click(bouton(t("onboarding.tour.skip")));

    // La visite reste à l'écran, et dit pourquoi « Passer » n'a pas abouti.
    await waitFor(() => {
      expect(texteDe("alert")).toBe(t("onboarding.tour.saveFailed", { reason: echec }));
    });
    expect(screen.getByRole("heading", { name: PREMIER_ECRAN })).toBeTruthy();

    await user.click(bouton(t("onboarding.tour.skip")));

    expect(await screen.findByRole("heading", { name: t("onboarding.title") })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pont.completeWelcomeTour).toHaveBeenCalledTimes(2);
  });
});
