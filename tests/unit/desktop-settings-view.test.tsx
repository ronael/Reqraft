// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsApp } from "@/apps/desktop/renderer/settings/SettingsApp.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type { ReqraftBridge, SafeConfig } from "@/apps/desktop/shared/ipc-contract.js";
import { createDesktopTranslator, DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";
import { createTranslator } from "@/i18n/translate.js";
import {
  corrompreLaConfiguration,
  dependancesSansTrousseau,
  joindreProcessusPrincipal,
  type CanalPrincipal,
} from "./desktop-main-process.js";

/**
 * La fenêtre de réglages montée pour de vrai, avec le seul contact qu'elle a
 * avec le dehors : `window.reqraft`.
 *
 * Ce qui est vérifié est ce que la fenêtre affiche. Les onglets pris un à un
 * ont leurs propres suites ; celle-ci couvre la fenêtre autour d'eux.
 */

const t = createDesktopTranslator("en");
/** Le catalogue partagé, où le processus principal prend la phrase des erreurs. */
const tPartage = createTranslator("en");

/**
 * Le pont des réglages, la lecture de la configuration passant par le vrai
 * processus principal.
 *
 * Les autres appels du montage rendent un état neutre : ils ne sont pas le
 * sujet, et la configuration est la seule chose dont les onglets ne peuvent
 * pas se passer.
 */
function installerPont(principal: CanalPrincipal): void {
  const pont = {
    platform: "darwin",
    readLocale: (locale = "en") => Promise.resolve({ locale, messages: DESKTOP_MESSAGES[locale] }),
    readConfig: () => principal(IPC_CHANNELS.configRead) as Promise<SafeConfig>,
    providersStatus: () => Promise.resolve([]),
    shortcutsState: () =>
      Promise.resolve({ registered: [], rejected: [], conflicts: [], suspended: false }),
    permissionsState: () => Promise.resolve({ accessibility: true, canReplace: true }),
    updatesState: () => Promise.resolve({ status: "idle", currentVersion: "0.0.0" }),
  } satisfies Partial<ReqraftBridge>;
  // Les autres fonctions du pont restent absentes : un appel inattendu doit
  // échouer bruyamment, pas rendre `undefined`.
  window.reqraft = pont as unknown as ReqraftBridge;
}

afterEach(() => {
  cleanup();
});

describe("l'ouverture des réglages", () => {
  it("dit en clair pourquoi une configuration corrompue est illisible", async () => {
    const fichier = await corrompreLaConfiguration();
    installerPont(joindreProcessusPrincipal(dependancesSansTrousseau()));

    render(
      <TranslationProvider>
        <SettingsApp />
      </TranslationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent.trim()).toBe(
        t("settings.configUnreadable", {
          reason: tPartage("error.config.invalid", { path: fichier }),
        }),
      );
    });
    // La barre d'état ne promet plus des réglages qui ne viendront pas.
    expect(screen.queryByText(t("settings.loadingConfig"))).toBeNull();
  });
});
