import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  app,
  clipboard,
  crashReporter,
  globalShortcut,
  ipcMain,
  screen,
  systemPreferences,
} from "electron";
import { CaptureService } from "./capture-service.js";
import { applyCrashReportPolicy } from "./crash-report.js";
import { registerIpcHandlers } from "./ipc.js";
import { createMacosBridge, createOsascriptRunner } from "./macos.js";
import {
  createSystemPermissionsProbe,
  probePermissions,
  requestAccessibility,
} from "./permissions.js";
import { registerShortcuts } from "./shortcuts.js";
import { createCapsuleWindow } from "./windows/capsule.js";

/**
 * Desktop bootstrap. Order matters:
 * 1. the crash reporter stays off, before anything can start it (§5.7) ;
 * 2. a second instance quits instead of fighting for the global shortcut
 *    (§5.8) ;
 * 3. the app runs accessory-style, without a Dock icon on macOS.
 */
applyCrashReportPolicy(crashReporter);

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

  app.on("second-instance", () => {
    // Lot 3: refocus the capsule. There is nothing to focus yet.
  });

  void app.whenReady().then(() => {
    const bridge = createMacosBridge(createOsascriptRunner());
    const captureService = new CaptureService({ bridge, clipboard });
    const permissionsProbe = createSystemPermissionsProbe(
      systemPreferences,
      bridge,
      process.env,
      process.platform,
    );

    registerIpcHandlers({
      ipcMain,
      clipboard,
      captureService,
      probePermissions: async () => await probePermissions(permissionsProbe),
      requestAccessibility: () => {
        requestAccessibility(systemPreferences);
      },
    });

    const mainDir = path.dirname(fileURLToPath(import.meta.url));
    const capsule = createCapsuleWindow({
      preloadPath: path.join(mainDir, "../preload/index.cjs"),
      rendererFile: path.join(mainDir, "../renderer/index.html"),
      devServerUrl: process.env.REQRAFT_DESKTOP_DEV_SERVER,
    });

    const resolution = registerShortcuts(
      (accelerator, handler) => globalShortcut.register(accelerator, handler),
      {
        onCapture: () => {
          // Record the source app and capture BEFORE the capsule takes the
          // focus (§5.2), then show anchored at the cursor (§3).
          const cursor = screen.getCursorScreenPoint();
          void captureService.trigger().then(() => {
            capsule.show({ kind: "cursor", point: cursor });
          });
        },
        onInput: () => {
          captureService.clear();
          capsule.show({ kind: "centered" });
        },
      },
      process.env.REQRAFT_SHORTCUT,
    );

    if (resolution.registered.length === 0) {
      // §5.5: never silent. The settings window (lot 5) will surface this;
      // until then the failure is at least on record.
      console.error(
        `Reqraft: aucun raccourci global disponible (refusés : ${resolution.rejected.join(", ")})`,
      );
    }

    app.on("will-quit", () => {
      globalShortcut.unregisterAll();
    });
  });

  app.on("window-all-closed", () => {
    // An accessory app on macOS stays alive without windows.
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
