// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { ProfilesTab } from "@/apps/desktop/renderer/settings/ProfilesTab.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import type {
  ProfileCatalogEntry,
  ProfileCatalogProblemInfo,
  ProfileCatalogResponse,
  ProfileDetail,
  ProfileMutationResponse,
  ReqraftBridge,
} from "@/apps/desktop/shared/ipc-contract.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { DESKTOP_EN as EN } from "@/i18n/desktop/en.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

/**
 * Réglages → Profils, rendu pour de vrai.
 *
 * `desktop-profiles-flow.test.ts` rejoue les appels du pont contre les vrais
 * handlers ; ici c'est l'inverse : l'onglet est monté, le pont est faux, et on
 * fait ce que fait la personne — lire la liste, ouvrir un formulaire, taper,
 * confirmer une suppression. Ce qui est vérifié est ce qu'elle lit et ce que le
 * pont reçoit.
 */

afterEach(cleanup);

const t = createDesktopTranslator("en");

const AUTO: ProfileCatalogEntry = {
  id: "auto",
  name: "Automatic",
  description: "Picks the profile that fits the text.",
  origin: "auto",
};
const WRITING: ProfileCatalogEntry = {
  id: "writing",
  name: "Writing",
  description: "Clear prose for any reader.",
  origin: "builtin",
  defaultLevel: "standard",
};
const CODE: ProfileCatalogEntry = {
  id: "code",
  name: "Code",
  description: "Requests for a coding assistant.",
  origin: "builtin",
};
const SUPPORT: ProfileCatalogEntry = {
  id: "support",
  name: "Customer support",
  description: "Polite answers to customers.",
  origin: "local",
  defaultLevel: "complete",
};

const SUPPORT_DETAIL: ProfileDetail = {
  id: "support",
  name: "Customer support",
  description: "Polite answers to customers.",
  extends: "writing",
  defaultLevel: "complete",
  instructions: "Answer politely, in three sentences at most.",
};

function catalogue(...entries: ProfileCatalogEntry[]): ProfileCatalogResponse {
  return { entries, problems: [] };
}

const FULL = catalogue(AUTO, WRITING, CODE, SUPPORT);

/** Une macrotâche : tout ce qui s'enchaîne sur une réponse a eu lieu. */
function settled(): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, 0);
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => Promise<void>;
}

/** Une réponse du pont que le test libère quand il le décide. */
function deferred<T>(): Deferred<T> {
  let release: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve: async (value) => {
      release?.(value);
      await settled();
    },
  };
}

type ProfileChannel =
  | "profileCatalog"
  | "readProfile"
  | "saveProfile"
  | "duplicateProfile"
  | "deleteProfile"
  | "exportProfile";

type ProfileBridge = { [Channel in ProfileChannel]: Mock<ReqraftBridge[Channel]> };

interface ProfilesHarness {
  bridge: ProfileBridge;
  onSelectDefault: Mock<(id: string) => void>;
  user: UserEvent;
}

interface RenderOptions {
  defaultProfile?: string;
  catalog?: ReqraftBridge["profileCatalog"];
}

/** Monte l'onglet et attend ses libellés, qui arrivent par le pont. */
async function renderTab(options: RenderOptions = {}): Promise<ProfilesHarness> {
  const bridge: ProfileBridge = {
    profileCatalog: vi.fn<ReqraftBridge["profileCatalog"]>(
      options.catalog ?? (() => Promise.resolve(FULL)),
    ),
    readProfile: vi.fn<ReqraftBridge["readProfile"]>(() => Promise.resolve(SUPPORT_DETAIL)),
    saveProfile: vi.fn<ReqraftBridge["saveProfile"]>(() => Promise.resolve({ catalog: FULL })),
    duplicateProfile: vi.fn<ReqraftBridge["duplicateProfile"]>(() =>
      Promise.resolve({ catalog: FULL }),
    ),
    deleteProfile: vi.fn<ReqraftBridge["deleteProfile"]>(() => Promise.resolve({ catalog: FULL })),
    exportProfile: vi.fn<ReqraftBridge["exportProfile"]>(() =>
      Promise.resolve({ path: "profile.json" }),
    ),
  };
  const preload: Pick<ReqraftBridge, "platform" | "readLocale" | ProfileChannel> = {
    platform: "darwin",
    readLocale: () => Promise.resolve({ locale: "en", messages: EN }),
    ...bridge,
  };
  window.reqraft = preload as ReqraftBridge;
  const onSelectDefault = vi.fn<(id: string) => void>();
  render(
    <TranslationProvider>
      <ProfilesTab
        config={{ ...DEFAULT_CONFIG, defaultProfile: options.defaultProfile ?? "writing" }}
        onSelectDefault={onSelectDefault}
      />
    </TranslationProvider>,
  );
  await screen.findByRole("button", { name: EN["profiles.new"] });
  return { bridge, onSelectDefault, user: userEvent.setup() };
}

/** La ligne d'un profil, par son nom, une fois qu'elle est à l'écran. */
function row(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const match = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText(name) !== null);
    if (match === undefined) throw new Error(`Aucune ligne « ${name} »`);
    return match;
  });
}

/** Les actions d'une ligne, dans l'ordre, par leur nom accessible. */
function actionsOf(item: HTMLElement): (string | null)[] {
  return within(item)
    .getAllByRole("button")
    .map((action) => action.getAttribute("aria-label"));
}

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByRole<HTMLInputElement | HTMLTextAreaElement>("textbox", {
    name: (name) => name.startsWith(label),
  });
}

function queryField(label: string): HTMLElement | null {
  return screen.queryByRole("textbox", { name: (name) => name.startsWith(label) });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name: EN["settings.save"] });
}

async function choose(user: UserEvent, combobox: string, option: string): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  await user.click(screen.getByRole("option", { name: option }));
}

interface FormInput {
  name?: string;
  id?: string;
  description?: string;
  instructions?: string;
}

/** Tape dans les champs donnés, dans l'ordre du formulaire. */
async function fill(user: UserEvent, input: FormInput): Promise<void> {
  if (input.name !== undefined) await user.type(field(EN["profiles.name"]), input.name);
  if (input.id !== undefined) {
    await user.clear(field(EN["settings.identifier"]));
    await user.type(field(EN["settings.identifier"]), input.id);
  }
  if (input.description !== undefined) {
    await user.type(field(EN["profiles.description"]), input.description);
  }
  if (input.instructions !== undefined) {
    await user.type(field(EN["profiles.instructions"]), input.instructions);
  }
}

/** Ouvre le formulaire de création, une fois le catalogue (et ses bases) chargé. */
async function openNewForm(user: UserEvent): Promise<void> {
  await row(SUPPORT.name);
  await user.click(screen.getByRole("button", { name: EN["profiles.new"] }));
}

const COMPLETE: FormInput = {
  name: "Notes",
  description: "Meeting notes.",
  instructions: "Bullet points, one decision per line.",
};

describe("ProfilesTab — la liste des profils", () => {
  it("donne à chaque profil son origine et les seules actions permises", async () => {
    await renderTab();

    const auto = await row(AUTO.name);
    expect(within(auto).getByText("Auto")).toBeTruthy();
    expect(within(auto).getByText(AUTO.description)).toBeTruthy();
    expect(actionsOf(auto)).toEqual([EN["profiles.use"]]);

    const code = await row(CODE.name);
    expect(within(code).getByText(EN["profiles.builtin"])).toBeTruthy();
    expect(actionsOf(code)).toEqual([
      EN["profiles.use"],
      EN["profiles.duplicate"],
      EN["profiles.export"],
    ]);

    const support = await row(SUPPORT.name);
    expect(within(support).getByText("Local")).toBeTruthy();
    expect(actionsOf(support)).toEqual([
      EN["profiles.use"],
      EN["settings.edit"],
      EN["profiles.duplicate"],
      EN["profiles.export"],
      EN["settings.delete"],
    ]);
  });

  it("montre le niveau de chaque profil, sinon son identifiant", async () => {
    await renderTab({ defaultProfile: "auto" });

    const writing = await row(WRITING.name);
    expect(within(writing).getByText(t("profiles.levelMeta", { level: "standard" }))).toBeTruthy();
    expect(within(await row(CODE.name)).getByText("code")).toBeTruthy();
    // Le profil utilisé, sans niveau à lui, le dit à la place.
    expect(within(await row(AUTO.name)).getByText(EN["profiles.tooltipInUse"])).toBeTruthy();
  });

  it("marque le profil utilisé et laisse en choisir un autre", async () => {
    const { onSelectDefault, user } = await renderTab({ defaultProfile: "writing" });

    expect(actionsOf(await row(WRITING.name))[0]).toBe(EN["profiles.tooltipInUse"]);
    const code = await row(CODE.name);
    await user.click(within(code).getByRole("button", { name: EN["profiles.use"] }));

    expect(onSelectDefault).toHaveBeenCalledWith("code");
  });

  it("attend le catalogue avant de lister les profils", async () => {
    const answer = deferred<ProfileCatalogResponse>();
    await renderTab({ catalog: () => answer.promise });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);

    await act(() => answer.resolve(FULL));

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("invite à créer un profil tant qu'aucun profil local n'existe", async () => {
    await renderTab({ catalog: () => Promise.resolve(catalogue(AUTO, WRITING)) });

    await row(WRITING.name);
    expect(screen.getByText(EN["profiles.empty"])).toBeTruthy();
  });

  it("retire l'invitation dès qu'un profil local existe", async () => {
    await renderTab();

    await row(SUPPORT.name);
    expect(screen.queryByText(EN["profiles.empty"])).toBeNull();
  });

  it("signale un fichier de profil cassé et un profil masqué par le projet", async () => {
    const broken: ProfileCatalogProblemInfo = {
      kind: "invalid",
      id: "broken",
      path: "profiles/broken.json",
      detail: "broken.json: the instructions are missing.",
    };
    const shadowed: ProfileCatalogProblemInfo = {
      kind: "shadowed",
      id: "support",
      path: "profiles/support.json",
      detail: "support.json is hidden by the project's own profile.",
    };
    await renderTab({
      catalog: () => Promise.resolve({ entries: [WRITING], problems: [broken, shadowed] }),
    });

    expect(await screen.findByText(broken.detail)).toBeTruthy();
    expect(screen.getByText(shadowed.detail)).toBeTruthy();
  });

  it("dit pourquoi le catalogue n'a pas pu être lu, sans le préfixe d'Electron", async () => {
    await renderTab({
      catalog: () =>
        Promise.reject(
          new Error(
            "Error invoking remote method 'profiles:catalog': Error: The profiles folder cannot be read.",
          ),
        ),
    });

    expect(await screen.findByText("The profiles folder cannot be read.")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("ProfilesTab — créer un profil local", () => {
  it("crée un profil complet et le retrouve dans la liste", async () => {
    const created: ProfileCatalogEntry = {
      id: "redaction-web",
      name: "Rédaction web",
      description: "Copy for web pages.",
      origin: "local",
      defaultLevel: "complete",
    };
    const { bridge, user } = await renderTab();
    bridge.saveProfile.mockResolvedValueOnce({
      catalog: catalogue(AUTO, WRITING, CODE, SUPPORT, created),
    });
    await openNewForm(user);

    expect(screen.getByText(EN["profiles.formCreateTitle"])).toBeTruthy();
    await user.type(field(EN["profiles.name"]), "Rédaction web");
    // L'identifiant suit le nom, accents retirés.
    expect(field(EN["settings.identifier"]).value).toBe("redaction-web");
    await user.type(field(EN["profiles.description"]), "Copy for web pages.");
    await choose(user, EN["profiles.base"], "writing");
    await choose(user, EN["profiles.defaultLevel"], "complete");
    await user.type(field(EN["profiles.instructions"]), "Short sentences, one idea each.");
    await user.click(saveButton());

    expect(await row("Rédaction web")).toBeTruthy();
    expect(bridge.saveProfile).toHaveBeenCalledWith({
      mode: "create",
      profile: {
        id: "redaction-web",
        name: "Rédaction web",
        description: "Copy for web pages.",
        extends: "writing",
        defaultLevel: "complete",
        instructions: "Short sentences, one idea each.",
      },
    });
  });

  it("envoie des valeurs nettoyées, et aucune base quand aucune n'est choisie", async () => {
    const { bridge, user } = await renderTab();
    await openNewForm(user);

    await fill(user, {
      name: "  Notes  ",
      description: " Meeting notes. ",
      instructions: " Bullet points. ",
    });
    await user.click(saveButton());

    await row(SUPPORT.name);
    expect(bridge.saveProfile.mock.lastCall?.[0]).toStrictEqual({
      mode: "create",
      profile: {
        id: "notes",
        name: "Notes",
        description: "Meeting notes.",
        defaultLevel: "standard",
        instructions: "Bullet points.",
      },
    });
  });

  it("cesse de suivre le nom dès qu'un identifiant est saisi à la main", async () => {
    const { user } = await renderTab();
    await openNewForm(user);

    await fill(user, { name: "Notes", id: "meeting-notes" });
    await user.type(field(EN["profiles.name"]), " v2");

    expect(field(EN["profiles.name"]).value).toBe("Notes v2");
    expect(field(EN["settings.identifier"]).value).toBe("meeting-notes");
  });

  it.each([
    { cas: "sans nom", input: {}, problem: EN["profiles.nameRequired"] },
    {
      cas: "un nom dont on ne tire aucun identifiant",
      input: { name: "!!!" },
      problem: EN["profiles.idRequired"],
    },
    {
      cas: "un identifiant mal formé",
      input: { name: "Notes", id: "Notes 2" },
      problem: EN["profiles.idInvalid"],
    },
    {
      cas: "un identifiant déjà pris",
      input: { name: "Writing" },
      problem: t("profiles.idTaken", { id: "writing" }),
    },
    {
      cas: "sans description",
      input: { name: "Notes" },
      problem: EN["profiles.descriptionRequired"],
    },
    {
      cas: "sans instructions",
      input: { name: "Notes", description: "Meeting notes." },
      problem: EN["profiles.instructionsRequired"],
    },
  ])("refuse d'enregistrer $cas, et dit pourquoi", async ({ input, problem }) => {
    const { bridge, user } = await renderTab();
    await openNewForm(user);

    await fill(user, input);
    await user.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(problem);
    expect(bridge.saveProfile).not.toHaveBeenCalled();
  });

  // En attente d'un correctif : `problem` n'est effacé qu'à l'envoi, à l'annulation
  // ou à l'ouverture d'un profil, et « Save » reste désactivé tant qu'il existe.
  // Après un premier refus, compléter les champs ne réactive donc rien ; seul
  // « Cancel » sort du formulaire, en perdant la saisie.
  it.todo("laisse enregistrer une fois le problème corrigé");

  it("garde le formulaire ouvert sur un refus du processus principal, puis réessaie", async () => {
    const refusal =
      "This local profile identifier is reserved, built-in or not portable. Pick another one.";
    const { bridge, user } = await renderTab();
    bridge.saveProfile.mockRejectedValueOnce(
      new Error(`Error invoking remote method 'profiles:save': Error: ${refusal}`),
    );
    await openNewForm(user);

    await fill(user, COMPLETE);
    await user.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(refusal);
    expect(screen.getByText(EN["profiles.formCreateTitle"])).toBeTruthy();
    expect(saveButton().disabled).toBe(false);

    await user.click(saveButton());

    expect(await row(SUPPORT.name)).toBeTruthy();
    expect(bridge.saveProfile).toHaveBeenCalledTimes(2);
  });

  it("annonce l'enregistrement en cours et empêche un second envoi", async () => {
    const answer = deferred<ProfileMutationResponse>();
    const { bridge, user } = await renderTab();
    bridge.saveProfile.mockReturnValueOnce(answer.promise);
    await openNewForm(user);

    await fill(user, COMPLETE);
    await user.click(saveButton());

    const saving = screen.getByRole<HTMLButtonElement>("button", { name: EN["settings.saving"] });
    expect(saving.disabled).toBe(true);

    await act(() => answer.resolve({ catalog: FULL }));

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(bridge.saveProfile).toHaveBeenCalledTimes(1);
  });

  it("abandonne la création sans rien envoyer", async () => {
    const { bridge, user } = await renderTab();
    await openNewForm(user);

    await fill(user, { name: "Notes" });
    await user.click(screen.getByRole("button", { name: EN["settings.cancel"] }));

    expect(await row(SUPPORT.name)).toBeTruthy();
    expect(bridge.saveProfile).not.toHaveBeenCalled();
  });
});

describe("ProfilesTab — modifier ou dupliquer", () => {
  it("ouvre un profil local, garde son identifiant et enregistre la modification", async () => {
    const { bridge, user } = await renderTab();
    const support = await row(SUPPORT.name);
    await user.click(within(support).getByRole("button", { name: EN["settings.edit"] }));

    expect(await screen.findByText(t("profiles.formUpdateTitle", { id: "support" }))).toBeTruthy();
    expect(bridge.readProfile).toHaveBeenCalledWith("support");
    const identifier = field(EN["settings.identifier"]);
    expect(identifier.value).toBe("support");
    expect(identifier.disabled).toBe(true);
    expect(screen.getByText(EN["profiles.notEditableTag"])).toBeTruthy();
    expect(screen.getByRole("combobox", { name: EN["profiles.base"] }).textContent).toBe("writing");
    expect(field(EN["profiles.instructions"]).value).toBe(SUPPORT_DETAIL.instructions);

    await user.type(field(EN["profiles.name"]), " team");
    await user.clear(field(EN["profiles.description"]));
    await user.type(field(EN["profiles.description"]), "Answers to customers, by email.");
    await user.click(saveButton());

    expect(await row(SUPPORT.name)).toBeTruthy();
    expect(bridge.saveProfile).toHaveBeenCalledWith({
      mode: "update",
      profile: {
        id: "support",
        name: "Customer support team",
        description: "Answers to customers, by email.",
        extends: "writing",
        defaultLevel: "complete",
        instructions: SUPPORT_DETAIL.instructions,
      },
    });
  });

  it("dit pourquoi un profil local ne s'ouvre pas", async () => {
    const { bridge, user } = await renderTab();
    bridge.readProfile.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'profiles:read': Error: support.json is not valid JSON.",
      ),
    );
    const support = await row(SUPPORT.name);
    await user.click(within(support).getByRole("button", { name: EN["settings.edit"] }));

    expect(await screen.findByText("support.json is not valid JSON.")).toBeTruthy();
    expect(screen.queryByText(t("profiles.formUpdateTitle", { id: "support" }))).toBeNull();
  });

  it("duplique un profil intégré sous un nouvel identifiant", async () => {
    const copy: ProfileCatalogEntry = {
      id: "short-writing",
      name: "Short writing",
      description: WRITING.description,
      origin: "local",
      defaultLevel: "standard",
    };
    const { bridge, user } = await renderTab();
    bridge.duplicateProfile.mockResolvedValueOnce({
      catalog: catalogue(AUTO, WRITING, CODE, SUPPORT, copy),
    });
    const writing = await row(WRITING.name);
    await user.click(within(writing).getByRole("button", { name: EN["profiles.duplicate"] }));

    expect(screen.getByText(t("profiles.formDuplicateTitle", { id: "writing" }))).toBeTruthy();
    expect(screen.getByText(EN["profiles.duplicateNote"])).toBeTruthy();
    // La copie garde tout du profil source : seuls son nom et son identifiant se choisissent.
    expect(field(EN["profiles.name"]).value).toBe(WRITING.name);
    expect(field(EN["settings.identifier"]).value).toBe("");
    expect(queryField(EN["profiles.description"])).toBeNull();
    expect(queryField(EN["profiles.instructions"])).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();

    await user.clear(field(EN["profiles.name"]));
    await user.type(field(EN["profiles.name"]), "Short writing");
    expect(field(EN["settings.identifier"]).value).toBe("short-writing");
    await user.click(saveButton());

    expect(await row("Short writing")).toBeTruthy();
    expect(bridge.duplicateProfile).toHaveBeenCalledWith({
      sourceId: "writing",
      targetId: "short-writing",
      name: "Short writing",
    });
  });
});

describe("ProfilesTab — supprimer et exporter", () => {
  const question = t("profiles.confirmDeleteQuestion", { id: "support" });

  it("demande confirmation avant de supprimer, et laisse renoncer", async () => {
    const { bridge, user } = await renderTab();
    const support = await row(SUPPORT.name);

    await user.click(within(support).getByRole("button", { name: EN["settings.delete"] }));
    expect(within(support).getByText(question)).toBeTruthy();
    expect(actionsOf(support)).toEqual([EN["profiles.confirmDelete"], EN["settings.cancel"]]);

    await user.click(within(support).getByRole("button", { name: EN["settings.cancel"] }));
    expect(within(support).queryByText(question)).toBeNull();
    expect(actionsOf(support)).toHaveLength(5);
    expect(bridge.deleteProfile).not.toHaveBeenCalled();
  });

  it("supprime après confirmation, sans second envoi, et retire la ligne", async () => {
    const answer = deferred<ProfileMutationResponse>();
    const { bridge, user } = await renderTab();
    bridge.deleteProfile.mockReturnValueOnce(answer.promise);
    const support = await row(SUPPORT.name);

    await user.click(within(support).getByRole("button", { name: EN["settings.delete"] }));
    await user.click(within(support).getByRole("button", { name: EN["profiles.confirmDelete"] }));

    expect(bridge.deleteProfile).toHaveBeenCalledWith("support");
    const confirm = within(support).getByRole<HTMLButtonElement>("button", {
      name: EN["profiles.confirmDelete"],
    });
    expect(confirm.disabled).toBe(true);

    await act(() => answer.resolve({ catalog: catalogue(AUTO, WRITING, CODE) }));

    expect(screen.queryByText(SUPPORT.name)).toBeNull();
    expect(screen.getByText(EN["profiles.empty"])).toBeTruthy();
  });

  it("garde la question ouverte quand la suppression échoue", async () => {
    const { bridge, user } = await renderTab();
    bridge.deleteProfile.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'profiles:delete': Error: support.json could not be removed.",
      ),
    );
    const support = await row(SUPPORT.name);

    await user.click(within(support).getByRole("button", { name: EN["settings.delete"] }));
    await user.click(within(support).getByRole("button", { name: EN["profiles.confirmDelete"] }));

    expect(await screen.findByText("support.json could not be removed.")).toBeTruthy();
    expect(within(support).getByText(question)).toBeTruthy();
    const confirm = within(support).getByRole<HTMLButtonElement>("button", {
      name: EN["profiles.confirmDelete"],
    });
    expect(confirm.disabled).toBe(false);
  });

  it("exporte un profil intégré en JSON", async () => {
    const { bridge, user } = await renderTab();
    const writing = await row(WRITING.name);

    await user.click(within(writing).getByRole("button", { name: EN["profiles.export"] }));

    expect(bridge.exportProfile).toHaveBeenCalledWith("writing");
  });

  it("dit pourquoi un export a échoué", async () => {
    const { bridge, user } = await renderTab();
    bridge.exportProfile.mockRejectedValueOnce(new Error("The file could not be written."));
    const support = await row(SUPPORT.name);

    await user.click(within(support).getByRole("button", { name: EN["profiles.export"] }));

    expect(await screen.findByText("The file could not be written.")).toBeTruthy();
  });
});
