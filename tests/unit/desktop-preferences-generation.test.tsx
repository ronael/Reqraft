/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PreferencesTab,
  type PreferencesTabProps,
} from "@/apps/desktop/renderer/settings/PreferencesTab.js";

afterEach(() => {
  cleanup();
});

// Sans `TranslationProvider`, le traducteur rend la clé : les libellés attendus
// ici sont donc les clés elles-mêmes, comme dans les autres tests de réglages.
function renderTab(overrides: Partial<PreferencesTabProps> = {}): {
  onPatchConfig: ReturnType<typeof vi.fn>;
} {
  const onPatchConfig = vi.fn();
  const props: PreferencesTabProps = {
    chosen: {},
    onChoose: () => undefined,
    onResetShortcuts: () => undefined,
    onRetestShortcuts: () => undefined,
    captureShortcut: "",
    inputShortcut: "",
    popoverShortcut: "",
    rejectedShortcuts: [],
    conflictingShortcuts: [],
    shortcutsSuspended: false,
    hasNoShortcut: false,
    permissionDetail: "",
    canReplace: true,
    onAskPermissions: () => undefined,
    uiLocale: "auto",
    onChooseLanguage: () => undefined,
    onOpenWelcomeTour: () => undefined,
    timeoutMs: 30_000,
    fidelityMode: "balanced",
    outputLanguage: "auto",
    onPatchConfig,
    ...overrides,
  };
  render(<PreferencesTab {...props} />);
  return { onPatchConfig };
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(label);
}

describe("PreferencesTab — réglages de génération", () => {
  it("affiche le délai en secondes et l'enregistre en millisecondes", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab({ timeoutMs: 30_000 });

    const timeout = field("settings.timeout");
    expect(timeout.value).toBe("30");

    await user.clear(timeout);
    await user.type(timeout, "45");
    await user.tab();

    expect(onPatchConfig).toHaveBeenCalledWith({ timeoutMs: 45_000 });
  });

  it("n'enregistre qu'une fois quand le délai est validé avec Entrée", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab();
    const timeout = field("settings.timeout");

    await user.clear(timeout);
    await user.type(timeout, "45{Enter}");

    expect(onPatchConfig).toHaveBeenCalledTimes(1);
    expect(onPatchConfig).toHaveBeenCalledWith({ timeoutMs: 45_000 });
  });

  it("refuse un délai nul et le dit à côté du champ", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab();

    const timeout = field("settings.timeout");
    await user.clear(timeout);
    await user.type(timeout, "0");
    await user.tab();

    expect(onPatchConfig).not.toHaveBeenCalled();
    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("settings.timeoutInvalid");
    expect(timeout.getAttribute("aria-invalid")).toBe("true");
    expect(timeout.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("laisse vider le plafond de tokens pour revenir à l'automatique", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab({ maxOutputTokens: 2048 });

    const tokens = field("settings.maxOutputTokens");
    expect(tokens.value).toBe("2048");

    await user.clear(tokens);
    await user.tab();

    expect(onPatchConfig).toHaveBeenCalledWith({ maxOutputTokens: undefined });
  });

  it("refuse un plafond de tokens qui n'est pas un entier positif", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab();

    const tokens = field("settings.maxOutputTokens");
    await user.type(tokens, "0");
    await user.tab();

    expect(onPatchConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("settings.maxOutputTokensInvalid");
  });

  it("enregistre le mode de fidélité choisi", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab();

    await user.selectOptions(screen.getByLabelText("settings.fidelity"), "strict");

    expect(onPatchConfig).toHaveBeenCalledWith({ fidelityMode: "strict" });
  });

  it("n'enregistre la langue de sortie qu'une fois saisie", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab({ outputLanguage: "auto" });

    await user.selectOptions(screen.getByLabelText("settings.outputLanguage"), "custom");
    expect(onPatchConfig).not.toHaveBeenCalled();

    const custom = field("settings.outputLanguageCustomLabel");
    await user.type(custom, "en-US");
    await user.tab();

    expect(onPatchConfig).toHaveBeenCalledWith({ outputLanguage: "en-US" });
  });

  it("revient à « auto » quand la langue personnalisée est abandonnée", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab({ outputLanguage: "en-US" });

    expect(field("settings.outputLanguageCustomLabel").value).toBe("en-US");

    await user.selectOptions(screen.getByLabelText("settings.outputLanguage"), "auto");

    expect(onPatchConfig).toHaveBeenCalledWith({ outputLanguage: "auto" });
  });

  it("refuse une langue personnalisée vide", async () => {
    const user = userEvent.setup();
    const { onPatchConfig } = renderTab({ outputLanguage: "auto" });

    await user.selectOptions(screen.getByLabelText("settings.outputLanguage"), "custom");
    const custom = field("settings.outputLanguageCustomLabel");
    await user.click(custom);
    await user.tab();

    expect(onPatchConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("settings.outputLanguageInvalid");
  });
});
