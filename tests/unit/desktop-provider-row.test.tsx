// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  BuiltinProviderRow,
  DefaultProviderBadge,
  builtinTestRequest,
} from "@/apps/desktop/renderer/settings/ProviderRow.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import type {
  ProviderStatus,
  ProviderTestResponse,
  ReqraftBridge,
} from "@/apps/desktop/shared/ipc-contract.js";
import { DESKTOP_EN as EN } from "@/i18n/desktop/en.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

/**
 * La ligne d'un fournisseur intégré, rendue pour de vrai.
 *
 * Elle ne garde aucun état : l'onglet lui dit où en est la clé, et elle lui
 * rend la main par ses rappels. Ce qui est vérifié est donc ce qu'elle affiche
 * pour chaque état de clé, et quel rappel part quand on appuie. Les libellés
 * passent par le pont comme dans l'application : ce sont les phrases anglaises
 * réelles.
 */

afterEach(cleanup);

const t = createDesktopTranslator("en");

function installBridge(): void {
  const bridge: Pick<ReqraftBridge, "platform" | "readLocale"> = {
    platform: "darwin",
    readLocale: () => Promise.resolve({ locale: "en", messages: EN }),
  };
  window.reqraft = bridge as ReqraftBridge;
}

function anthropic(overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    id: "anthropic",
    label: "Anthropic",
    configured: true,
    source: "keychain",
    models: [],
    requiresApiKey: true,
    supportsSecureAuth: true,
    envName: "ANTHROPIC_API_KEY",
    ...overrides,
  };
}

interface RowState {
  provider: ProviderStatus;
  isDefault: boolean;
  editing: boolean;
  confirming: boolean;
  secret: string;
  busy: boolean;
  testing: boolean;
  testsBlocked: boolean;
  result: ProviderTestResponse | undefined;
}

interface RowCallbacks {
  onTest: Mock<() => void>;
  onStartEdit: Mock<() => void>;
  onCancel: Mock<() => void>;
  onSave: Mock<() => void>;
  onStartRemove: Mock<() => void>;
  onCancelRemove: Mock<() => void>;
  onRemove: Mock<() => void>;
}

/**
 * La ligne, avec la seule chose que l'onglet tient pour elle : la clé en cours
 * de saisie. Le test n'est proposé que là où l'onglet le proposerait.
 */
function Row(props: Readonly<{ state: RowState; callbacks: RowCallbacks }>): React.JSX.Element {
  const [secret, setSecret] = useState(props.state.secret);
  const testable = builtinTestRequest(props.state.provider) !== undefined;
  return (
    <BuiltinProviderRow
      {...props.state}
      {...props.callbacks}
      onTest={testable ? props.callbacks.onTest : undefined}
      secret={secret}
      onSecretChange={setSecret}
    />
  );
}

function renderRow(overrides: Partial<RowState> = {}): RowCallbacks {
  installBridge();
  const callbacks: RowCallbacks = {
    onTest: vi.fn<() => void>(),
    onStartEdit: vi.fn<() => void>(),
    onCancel: vi.fn<() => void>(),
    onSave: vi.fn<() => void>(),
    onStartRemove: vi.fn<() => void>(),
    onCancelRemove: vi.fn<() => void>(),
    onRemove: vi.fn<() => void>(),
  };
  const state: RowState = {
    provider: anthropic(),
    isDefault: false,
    editing: false,
    confirming: false,
    secret: "",
    busy: false,
    testing: false,
    testsBlocked: false,
    result: undefined,
    ...overrides,
  };
  render(
    <TranslationProvider>
      <Row state={state} callbacks={callbacks} />
    </TranslationProvider>,
  );
  return callbacks;
}

/** Les boutons de la ligne, dans l'ordre, par ce qu'ils affichent. */
function buttonLabels(): (string | null)[] {
  return screen.queryAllByRole("button").map((button) => button.textContent);
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

const FROM_ENVIRONMENT = t("settings.keyFromEnv", { envName: "ANTHROPIC_API_KEY" });

interface KeyState {
  cas: string;
  provider: ProviderStatus;
  /** Ce que la ligne dit de la clé. */
  lines: string[];
  /** Les boutons proposés, dans l'ordre. */
  actions: string[];
}

describe("BuiltinProviderRow — ce que la ligne dit de la clé", () => {
  it.each<KeyState>([
    {
      cas: "une clé du trousseau",
      provider: anthropic({ source: "keychain" }),
      lines: [EN["settings.keyInKeychain"]],
      actions: [EN["settings.providerTest"], EN["settings.replaceKey"], EN["settings.remove"]],
    },
    {
      cas: "une clé lue dans l'environnement",
      provider: anthropic({ source: "environment" }),
      lines: [FROM_ENVIRONMENT, EN["settings.replaceEnvInApp"]],
      actions: [EN["settings.providerTest"], EN["settings.replaceKey"]],
    },
    {
      cas: "une clé d'environnement sans stockage sécurisé",
      provider: anthropic({ source: "environment", supportsSecureAuth: false }),
      lines: [FROM_ENVIRONMENT],
      actions: [EN["settings.providerTest"]],
    },
    {
      cas: "l'absence de clé",
      provider: anthropic({ configured: false, source: "not_configured" }),
      lines: [EN["settings.noKeyStored"]],
      actions: [EN["settings.addKey"]],
    },
    {
      cas: "l'absence de clé sans stockage sécurisé",
      provider: anthropic({
        configured: false,
        source: "not_configured",
        supportsSecureAuth: false,
      }),
      lines: [t("settings.secureStorageUnavailable", { envName: "ANTHROPIC_API_KEY" })],
      actions: [],
    },
  ])("décrit $cas et n'offre que ce qui est possible", async ({ provider, lines, actions }) => {
    renderRow({ provider });

    for (const line of lines) expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.queryByText(EN["settings.replaceEnvInApp"]) !== null).toBe(
      lines.includes(EN["settings.replaceEnvInApp"]),
    );
    expect(buttonLabels()).toEqual(actions);
  });

  it("marque le fournisseur que la capsule utilise", async () => {
    renderRow({ isDefault: true });

    const badge = await screen.findByTitle(EN["settings.defaultBadgeTitle"]);
    expect(badge.textContent).toBe(EN["settings.defaultBadge"]);
  });

  it("ne marque pas un fournisseur qui n'est pas celui par défaut", async () => {
    renderRow({ isDefault: false });

    await screen.findByText(EN["settings.keyInKeychain"]);
    expect(screen.queryByText(EN["settings.defaultBadge"])).toBeNull();
  });

  it("explique qu'un endpoint sert parce qu'il est déclaré en premier", async () => {
    installBridge();
    render(
      <TranslationProvider>
        <DefaultProviderBadge kind="endpoint" />
      </TranslationProvider>,
    );

    const badge = await screen.findByTitle(EN["settings.defaultBadgeEndpointTitle"]);
    expect(badge.textContent).toBe(EN["settings.defaultBadge"]);
  });
});

describe("BuiltinProviderRow — vérifier la configuration", () => {
  it("lance le test de la ligne", async () => {
    const user = userEvent.setup();
    const { onTest } = renderRow();

    await user.click(await screen.findByRole("button", { name: EN["settings.providerTest"] }));

    expect(onTest).toHaveBeenCalledTimes(1);
  });

  it("dit que le test tourne et retire le verdict précédent", async () => {
    renderRow({ testing: true, testsBlocked: true, result: { id: "anthropic", outcome: "ok" } });

    const running = await screen.findByRole<HTMLButtonElement>("button", {
      name: EN["settings.providerTesting"],
    });
    expect(running.disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    { cas: "un autre test tourne", state: { testsBlocked: true } },
    { cas: "une clé s'enregistre", state: { busy: true } },
  ])("bloque le test quand $cas", async ({ state }) => {
    renderRow(state);

    const test = await screen.findByRole<HTMLButtonElement>("button", {
      name: EN["settings.providerTest"],
    });
    expect(test.disabled).toBe(true);
  });

  it.each<{ cas: string; result: ProviderTestResponse; verdict: string }>([
    {
      cas: "une configuration valide",
      result: { id: "anthropic", outcome: "ok" },
      verdict: EN["settings.providerTestOk"],
    },
    {
      cas: "une entrée manquante nommée",
      result: { id: "anthropic", outcome: "missing_configuration", missing: ["ANTHROPIC_API_KEY"] },
      verdict: t("settings.providerTestMissing", { list: "ANTHROPIC_API_KEY" }),
    },
    {
      cas: "une configuration incomplète sans détail",
      result: { id: "anthropic", outcome: "missing_configuration", missing: [] },
      verdict: EN["settings.providerTestMissingUnknown"],
    },
    {
      cas: "une configuration refusée",
      result: { id: "anthropic", outcome: "invalid_configuration" },
      verdict: EN["settings.providerTestInvalid"],
    },
    {
      cas: "un fournisseur injoignable",
      result: { id: "anthropic", outcome: "unreachable" },
      verdict: EN["settings.providerTestUnreachable"],
    },
    {
      cas: "une vérification interrompue",
      result: { id: "anthropic", outcome: "error" },
      verdict: EN["settings.providerTestError"],
    },
  ])("annonce le verdict pour $cas", async ({ result, verdict }) => {
    renderRow({ result });

    const line = await screen.findByText(verdict);
    expect(line.getAttribute("role")).toBe("status");
  });
});

describe("BuiltinProviderRow — enregistrer une clé", () => {
  it.each([
    {
      cas: "ajouter une clé",
      provider: anthropic({ configured: false, source: "not_configured" }),
      action: EN["settings.addKey"],
    },
    {
      cas: "remplacer la clé",
      provider: anthropic({ source: "environment" }),
      action: EN["settings.replaceKey"],
    },
  ])("ouvre la saisie pour $cas", async ({ provider, action }) => {
    const user = userEvent.setup();
    const { onStartEdit } = renderRow({ provider });

    await user.click(await screen.findByRole("button", { name: action }));

    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("masque la clé saisie et ne la vérifie que si elle n'est pas vide", async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow({ editing: true });

    const field = await screen.findByPlaceholderText<HTMLInputElement>(EN["settings.pasteKey"]);
    expect(field.type).toBe("password");
    expect(button(EN["settings.verify"]).disabled).toBe(true);

    await user.type(field, "   ");
    expect(button(EN["settings.verify"]).disabled).toBe(true);

    await user.clear(field);
    await user.type(field, "sk-ant-test-key");
    expect(field.value).toBe("sk-ant-test-key");
    await user.click(button(EN["settings.verify"]));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("ne vérifie pas une seconde fois pendant un enregistrement", async () => {
    renderRow({ editing: true, secret: "sk-ant-test-key", busy: true });

    const verify = await screen.findByRole<HTMLButtonElement>("button", {
      name: EN["settings.verify"],
    });
    expect(verify.disabled).toBe(true);
  });

  it("abandonne la saisie", async () => {
    const user = userEvent.setup();
    const { onCancel, onSave } = renderRow({ editing: true });

    await user.click(await screen.findByRole("button", { name: EN["settings.cancel"] }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("BuiltinProviderRow — retirer une clé du trousseau", () => {
  it("demande d'abord une confirmation", async () => {
    const user = userEvent.setup();
    const { onStartRemove, onRemove } = renderRow({ provider: anthropic({ source: "keychain" }) });

    await user.click(await screen.findByRole("button", { name: EN["settings.remove"] }));

    expect(onStartRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("pose la question, puis supprime ou renonce", async () => {
    const user = userEvent.setup();
    const { onRemove, onCancelRemove } = renderRow({ confirming: true });

    expect(
      await screen.findByText(t("settings.confirmDeleteKey", { provider: "Anthropic" })),
    ).toBeTruthy();
    expect(buttonLabels()).toEqual([EN["settings.deleteForever"], EN["settings.cancel"]]);

    await user.click(button(EN["settings.cancel"]));
    expect(onCancelRemove).toHaveBeenCalledTimes(1);

    await user.click(button(EN["settings.deleteForever"]));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it.each([
    { cas: "le retrait", confirming: false, action: EN["settings.remove"] },
    { cas: "la suppression définitive", confirming: true, action: EN["settings.deleteForever"] },
  ])("bloque $cas pendant un enregistrement", async ({ confirming, action }) => {
    renderRow({ confirming, busy: true });

    const blocked = await screen.findByRole<HTMLButtonElement>("button", { name: action });
    expect(blocked.disabled).toBe(true);
  });
});

describe("builtinTestRequest", () => {
  it("ne propose un test qu'à un fournisseur intégré qui a une clé", () => {
    expect(builtinTestRequest(anthropic())).toEqual({ kind: "builtin", id: "anthropic" });
    expect(
      builtinTestRequest(anthropic({ configured: false, source: "not_configured" })),
    ).toBeUndefined();
  });

  it("ne propose jamais de tester mock ni la famille openai-compatible", () => {
    // `mock` répond toujours `ok`, et chaque endpoint compatible a son propre
    // bouton : un test ici ne pourrait rien apprendre à personne.
    const mock = anthropic({ id: "mock", label: "Mock", requiresApiKey: false });
    const compatible = anthropic({ id: "openai-compatible", label: "OpenAI Compatible" });

    expect(builtinTestRequest(mock)).toBeUndefined();
    expect(builtinTestRequest(compatible)).toBeUndefined();
  });
});
