// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsApp } from "@/apps/desktop/renderer/settings/SettingsApp.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import type { ReqraftBridge, SafeConfig } from "@/apps/desktop/shared/ipc-contract.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";
import type { UiLocale } from "@/i18n/locale.js";

/**
 * La question posée avant de retirer un endpoint compatible OpenAI.
 *
 * Elle était écrite en dur, en français, au milieu d'une fenêtre anglaise :
 * « Retirer « local » de votre configuration ? » à côté de « Confirm ».
 */

const CONFIG = {
  ...DEFAULT_CONFIG,
  providers: {
    local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1", name: "Ollama" },
  },
} as SafeConfig;

function installerPont(locale: UiLocale): void {
  const pont = {
    platform: "darwin",
    readLocale: () => Promise.resolve({ locale, messages: DESKTOP_MESSAGES[locale] }),
    readConfig: () => Promise.resolve(CONFIG),
    providersStatus: () => Promise.resolve([]),
    shortcutsState: () =>
      Promise.resolve({ registered: [], rejected: [], conflicts: [], suspended: false }),
    permissionsState: () => Promise.resolve({ accessibility: true, canReplace: true }),
    updatesState: () => Promise.resolve({ status: "idle", currentVersion: "0.0.0" }),
  } satisfies Partial<ReqraftBridge>;
  // Les autres fonctions restent absentes : un appel inattendu doit échouer
  // bruyamment, pas rendre `undefined`.
  window.reqraft = pont as unknown as ReqraftBridge;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/?tab=providers");
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("retirer un endpoint compatible", () => {
  it.each([
    { locale: "en" as const, question: "Remove “local” from your configuration?" },
    { locale: "fr" as const, question: "Retirer « local » de votre configuration ?" },
  ])("pose la question dans la langue de la fenêtre ($locale)", async ({ locale, question }) => {
    const messages = DESKTOP_MESSAGES[locale];
    installerPont(locale);
    render(
      <TranslationProvider>
        <SettingsApp />
      </TranslationProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: messages["settings.delete"] }));

    expect(screen.getByText(question)).toBeDefined();
    expect(screen.getByRole("button", { name: messages["settings.confirm"] })).toBeDefined();
  });
});
