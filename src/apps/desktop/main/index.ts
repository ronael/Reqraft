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
import { registerRendererProtocol, registerSchemePrivileges, rqRendererUrl } from "./protocol.js";
import { registerShortcuts, type ShortcutResolution } from "./shortcuts.js";
import { createOnboardingWindow } from "./windows/onboarding.js";
import { createTray } from "./tray.js";
import { createCapsuleWindow } from "./windows/capsule.js";
import { createPopoverWindow } from "./windows/popover.js";
import { createSettingsWindow } from "./windows/settings.js";
import { revealExistingWindow } from "./windows/reveal.js";

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

function bootstrap(): void {
  if (process.platform === "darwin") {
    // Accessory application: the Dock icon only comes back with packaging
    // (LSUIElement), which is lot 6.
    app.dock?.hide();
  }

  void app.whenReady().then(async () => {
    // Local profiles are files: the catalogue has to be read before anything
    // can resolve one. Without this the desktop saw the built-in profiles
    // alone, and a local profile chosen as the default failed the run with
    // `profile.unknown`. Failures are reported, never thrown — a broken file
    // must not stop the application from starting.
    const catalog = await loadProfileCatalog();
    for (const problem of catalog.problems) {
      console.error(`Profil local ignoré (${problem.path}) : ${problem.detail}`);
    }

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

    const capsule = createCapsuleWindow({
      ...windowDefaults,
      rendererUrl: rqRendererUrl(),
      devServerUrl: withSurface(),
    });
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

    registerIpcHandlers({
      ipcMain,
      clipboard,
      captureService,
      service: new RepromptService({
        executeReprompt,
        loadConfig,
        env: process.env,
        onRunEvent: (event) => {
          switch (event) {
            case "start":
              tray.setState("busy");
              break;
            case "done":
            case "cancelled":
              tray.setState("repos");
              break;
            case "error":
              tray.setState("error");
              break;
          }
        },
      }),
      probePermissions: async () => await probePermissions(permissionsProbe),
      requestAccessibility: () => {
        requestAccessibility(systemPreferences);
      },
      openSettings,
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
          filters: [{ name: "Profil Reqraft", extensions: ["json"] }],
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
      console.error("État de configuration indéterminé :", error);
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
      {
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
            capsule.show({ kind: "cursor", point: cursor });
            capsule.window.webContents.send(IPC_CHANNELS.capsuleOpened, { mode: "capture" });
          };
          void captureService
            .trigger()
            .then(show)
            .catch((error: unknown) => {
              console.error("Capture impossible :", error);
              show();
            });
        },
        onInput: () => {
          captureService.clear();
          capsule.show({ kind: "centered" });
          capsule.window.webContents.send(IPC_CHANNELS.capsuleOpened, { mode: "input" });
        },
      },
      process.env.REQRAFT_SHORTCUT,
      configuredShortcuts,
    );
    shortcutResolution = resolution;

    if (resolution.registered.length === 0) {
      // §5.5: never silent. The settings window (lot 5) will surface this;
      // until then the failure is at least on record.
      console.error(
        `Reqraft: aucun raccourci global disponible (refusés : ${resolution.rejected.join(", ")})`,
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
