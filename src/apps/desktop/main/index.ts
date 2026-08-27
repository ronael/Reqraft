import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
  app,
  clipboard,
  crashReporter,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  systemPreferences,
} from "electron";
import { executeReprompt } from "@/application/reprompt.js";
import { configPath, loadConfig } from "@/config/loader.js";
import { hydrateCredentials } from "@/auth/credentials.js";
import { CaptureService } from "./capture-service.js";
import { applyCrashReportPolicy } from "./crash-report.js";
import { loadProfileCatalog } from "@/profiles/catalog.js";
import { buildOnboardingState, registerIpcHandlers } from "./ipc.js";
import { createMacosBridge, createOsascriptRunner } from "./macos.js";
import {
  createSystemPermissionsProbe,
  probePermissions,
  requestAccessibility,
} from "./permissions.js";
import { RepromptService } from "./reprompt-service.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type { CapsuleOpenedPayload } from "@/apps/desktop/shared/ipc-contract.js";
import { registerRendererProtocol, registerSchemePrivileges, rqRendererUrl } from "./protocol.js";
import { registerShortcuts, type ShortcutResolution } from "./shortcuts.js";
import { createOnboardingWindow } from "./windows/onboarding.js";
import { createTray } from "./tray.js";
import type { TrayState } from "./tray-icon.js";
import { createCapsuleWindow } from "./windows/capsule.js";
import { createPopoverWindow } from "./windows/popover.js";
import { createSettingsWindow } from "./windows/settings.js";
import { revealExistingWindow } from "./windows/reveal.js";
import { resolveMainLocale, setMainLocale, t } from "./i18n.js";

/**
 * Desktop bootstrap. Order matters:
 * 1. the crash reporter stays off, before anything can start it (§5.7) ;
 * 2. a second instance quits instead of fighting for the global shortcut
 *    (§5.8) ;
 * 3. the app runs accessory-style, without a Dock icon on macOS.
 */
applyCrashReportPolicy(crashReporter);

// Scheme privileges are startup-only: they must be declared before the app
// is ready, so they live at module top level next to the crash policy.
registerSchemePrivileges();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

/**
 * Ce qui a déclenché la capsule, gardé et non seulement poussé.
 *
 * `webContents.send` se perd si le renderer n'écoute pas encore — une fenêtre
 * recréée charge son code au moment même où l'événement part. La capsule
 * restait alors sur son état de départ, sablier compris, sans jamais savoir
 * pourquoi elle s'était ouverte. Elle peut donc aussi le demander, et
 * l'identifiant croissant garantit qu'une double livraison ne relance rien.
 */
function createOuvertureTracker(): {
  annonce: (
    target: { notify: (channel: string, payload: unknown) => void },
    mode: "capture" | "input",
  ) => void;
  pending: () => CapsuleOpenedPayload | null;
} {
  let pending: CapsuleOpenedPayload | null = null;
  let compte = 0;
  return {
    annonce(target, mode) {
      compte += 1;
      pending = { id: compte, mode };
      target.notify(IPC_CHANNELS.capsuleOpened, pending);
    },
    pending: () => pending,
  };
}

/**
 * The language, before anything is displayed.
 *
 * The tray, the window titles and the permission messages are written in the
 * main process, and a menu built in one language cannot be relabelled
 * afterwards. A failed read leaves English in place rather than stopping the
 * start-up.
 */
async function applyConfiguredLocale(): Promise<void> {
  try {
    setMainLocale(resolveMainLocale((await loadConfig()).uiLocale));
  } catch (error) {
    console.error("Reqraft: could not read the interface language:", error);
  }
}

/**
 * Local profiles are files: the catalogue has to be read before anything can
 * resolve one. Without this the desktop saw the built-in profiles alone, and a
 * local profile chosen as the default failed the run with `profile.unknown`.
 * Failures are reported, never thrown — a broken file must not stop the
 * application from starting.
 */
async function preloadProfileCatalog(): Promise<void> {
  const catalog = await loadProfileCatalog();
  for (const problem of catalog.problems) {
    console.error(`Reqraft: local profile ignored (${problem.path}): ${problem.detail}`);
  }
}

/** L'icône de la barre suit le cycle de vie d'un run (lot 4). */
function trayStateFor(event: "start" | "done" | "error" | "cancelled"): TrayState {
  if (event === "start") return "busy";
  return event === "error" ? "error" : "repos";
}

/**
 * Relance unique, après avoir laissé l'IPC répondre au renderer.
 *
 * `app.relaunch()` ne quitte pas tout seul, et plusieurs appels planifient
 * plusieurs instances. Le délai court permet au `config:write` qui l'a causée
 * de terminer sa réponse avant la fermeture.
 */
function createRelauncher(): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 120);
  };
}

function bootstrap(): void {
  if (process.platform === "darwin") {
    // Accessory application: the Dock icon only comes back with packaging
    // (LSUIElement), which is lot 6.
    app.dock?.hide();
  }

  void app.whenReady().then(async () => {
    await applyConfiguredLocale();

    await preloadProfileCatalog();

    const relaunchApp = createRelauncher();
    const bridge = createMacosBridge(createOsascriptRunner());
    const captureService = new CaptureService({ bridge, clipboard });
    const permissionsProbe = createSystemPermissionsProbe(
      systemPreferences,
      bridge,
      process.env,
      process.platform,
    );

    const mainDir = path.dirname(fileURLToPath(import.meta.url));
    registerRendererProtocol(path.join(mainDir, "../renderer"));
    const devServerUrl = process.env.REQRAFT_DESKTOP_DEV_SERVER;
    const withSurface = (surface?: "popover" | "settings" | "onboarding"): string | undefined => {
      if (devServerUrl === undefined) {
        return undefined;
      }
      return surface === undefined ? devServerUrl : `${devServerUrl}?surface=${surface}`;
    };
    const windowDefaults = {
      preloadPath: path.join(mainDir, "../preload/index.cjs"),
    };

    const capsuleOptions = {
      ...windowDefaults,
      rendererUrl: rqRendererUrl(),
      devServerUrl: withSurface(),
    };
    let capsule = createCapsuleWindow(capsuleOptions);

    /*
     * Recrée la capsule si elle a été détruite.
     *
     * Elle est censée se cacher et non mourir, mais le garde-fou repose sur un
     * verrou `quitting` à sens unique : une fois `before-quit` déclenché, il ne
     * redescend jamais — et sur macOS l'application survit sans fenêtre. À
     * partir de là chaque fermeture détruisait la fenêtre pour de bon, et tous
     * les déclenchements suivants levaient « Object has been destroyed ».
     *
     * Plutôt que de parier sur le verrou, on répare : un raccourci doit ouvrir
     * une capsule, pas échouer en silence.
     */
    const liveCapsule = (): typeof capsule => {
      if (capsule.window.isDestroyed()) {
        capsule = createCapsuleWindow(capsuleOptions);
      }
      return capsule;
    };
    const popover = createPopoverWindow({
      ...windowDefaults,
      rendererUrl: rqRendererUrl("popover"),
      devServerUrl: withSurface("popover"),
    });

    // Filled by registerShortcuts below; read through IPC by the settings
    // Shortcuts tab (§5.5: a taken shortcut is visible, never silent).
    let shortcutResolution: ShortcutResolution = { registered: [], rejected: [] };

    // Settings window: created on demand, recreated if the user closed it.
    let settingsWindow: Electron.BrowserWindow | null = null;
    const openSettings = (): void => {
      if (settingsWindow === null || settingsWindow.isDestroyed()) {
        settingsWindow = createSettingsWindow({
          ...windowDefaults,
          rendererUrl: rqRendererUrl("settings"),
          devServerUrl: withSurface("settings"),
        });
        settingsWindow.on("closed", () => {
          settingsWindow = null;
        });
      } else {
        settingsWindow.show();
        settingsWindow.focus();
      }
    };

    // Onboarding window: opened only when the installation cannot be used as
    // it stands, and closed as soon as it can be.
    let onboardingWindow: Electron.BrowserWindow | null = null;
    const openOnboarding = (): void => {
      if (onboardingWindow === null || onboardingWindow.isDestroyed()) {
        onboardingWindow = createOnboardingWindow({
          ...windowDefaults,
          rendererUrl: rqRendererUrl("onboarding"),
          devServerUrl: withSurface("onboarding"),
        });
        onboardingWindow.on("closed", () => {
          onboardingWindow = null;
        });
      } else {
        onboardingWindow.show();
        onboardingWindow.focus();
      }
    };

    // The menu-bar tray mirrors run lifecycle: busy while a run is in
    // flight, error on failure, back to rest otherwise (lot 4).
    const tray = createTray({
      onTogglePopover: (bounds) => {
        popover.toggle(bounds);
      },
      onOpenSettings: openSettings,
    });

    // Nommés parce qu'ils servent deux fois : à l'enregistrement initial, et à
    // chaque fois qu'un réglage change une combinaison.
    const ouvertures = createOuvertureTracker();

    const shortcutHandlers = {
      onCapture: () => {
        // Record the source app and capture BEFORE the capsule takes the
        // focus (§5.2), then show anchored at the cursor (§3) and tell the
        // renderer to start a fresh session — the window persists between
        // triggers, it is hidden, never destroyed.
        const cursor = screen.getCursorScreenPoint();
        // The capsule opens whatever the capture did. `trigger()` already
        // degrades a failed capture to an empty one, and this catch is the
        // belt to that braces: a rejection here would leave the user pressing
        // a shortcut that does nothing but print to a console they never see.
        const show = (): void => {
          // `liveCapsule()` comme la branche saisie : la capture aussi doit
          // survivre à une fenêtre détruite, et c'est le chemin le plus utilisé.
          const target = liveCapsule();
          target.show({ kind: "cursor", point: cursor });
          ouvertures.annonce(target, "capture");
        };
        void captureService
          .trigger()
          .then(show)
          .catch((error: unknown) => {
            console.error("Reqraft: capture failed:", error);
            show();
          });
      },
      onInput: () => {
        captureService.clear();
        const target = liveCapsule();
        target.show({ kind: "centered" });
        ouvertures.annonce(target, "input");
      },
    };

    registerIpcHandlers({
      ipcMain,
      clipboard,
      captureService,
      service: new RepromptService({
        executeReprompt,
        loadConfig,
        env: process.env,
        onRunEvent: (event) => {
          tray.setState(trayStateFor(event));
        },
      }),
      probePermissions: async () => await probePermissions(permissionsProbe),
      requestAccessibility: () => {
        requestAccessibility(systemPreferences);
      },
      openSettings,
      capsulePending: () => ouvertures.pending(),
      // Rendre le focus clavier avant de coller, et ramener la capsule si le
      // remplacement n'a pas eu lieu — c'est elle qui porte le message.
      hideCapsule: () => {
        capsule.hide();
      },
      showCapsule: () => {
        capsule.reveal();
      },
      // Applique immédiatement un raccourci changé dans les réglages, au lieu
      // d'attendre le prochain lancement.
      onShortcutsChanged: (shortcuts) => {
        globalShortcut.unregisterAll();
        shortcutResolution = registerShortcuts(
          (accelerator, handler) => globalShortcut.register(accelerator, handler),
          shortcutHandlers,
          process.env.REQRAFT_SHORTCUT,
          shortcuts,
        );
      },
      relaunchApp,
      // Onboarding hands over to the settings window: the same choices, in the
      // place the user will come back to when they want to change one.
      onOnboardingComplete: () => {
        openSettings();
        onboardingWindow?.close();
      },
      shortcutState: () => shortcutResolution,
      showSaveDialog: async (defaultFileName) => {
        // The renderer never names a path: the user does, through the OS.
        const result = await dialog.showSaveDialog({
          defaultPath: defaultFileName,
          filters: [{ name: t("main.profileFileType"), extensions: ["json"] }],
        });
        return result.canceled ? undefined : result.filePath;
      },
    });

    // Does this installation work at all?
    //
    // Someone who downloaded only the application has no configuration file
    // and no key, and every surface would fail on its first run — a tray icon
    // whose shortcuts produce errors is worse than no answer. The rule is the
    // shared one, so the desktop and `rp init` cannot disagree about it.
    // Reported, never thrown: a failure to answer must not stop the launch.
    try {
      const onboarding = await buildOnboardingState(
        process.env,
        hydrateCredentials,
        loadConfig,
        () => existsSync(configPath()),
      );
      if (onboarding.required) {
        openOnboarding();
      }
    } catch (error) {
      console.error("Reqraft: could not determine the setup state:", error);
    }

    // Read once, here: the candidate chain is walked at start-up and a change
    // takes effect on the next launch, which is also when the OS lets us claim
    // a combination another application has since released.
    const configuredShortcuts = (await loadConfig()).desktopShortcuts;

    // Registered here rather than in `bootstrap()`: the answer to a second
    // launch is a window, and the windows only exist from this point. An
    // application with no Dock icon gives no other sign that it is running, so
    // a no-op reads as a failed start.
    app.on("second-instance", () => {
      revealExistingWindow([settingsWindow, popover.window, capsule.window], openSettings);
    });

    const resolution = registerShortcuts(
      (accelerator, handler) => globalShortcut.register(accelerator, handler),
      shortcutHandlers,
      process.env.REQRAFT_SHORTCUT,
      configuredShortcuts,
    );
    shortcutResolution = resolution;

    if (resolution.registered.length === 0) {
      // §5.5: never silent. The settings window (lot 5) will surface this;
      // until then the failure is at least on record.
      console.error(
        `Reqraft: no global shortcut available (rejected: ${resolution.rejected.join(", ")})`,
      );
    }

    app.on("will-quit", () => {
      globalShortcut.unregisterAll();
      tray.destroy();
    });
  });

  app.on("window-all-closed", () => {
    // An accessory app on macOS stays alive without windows.
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
