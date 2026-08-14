import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { app, clipboard, crashReporter, ipcMain } from "electron";
import { applyCrashReportPolicy } from "./crash-report.js";
import { registerIpcHandlers } from "./ipc.js";
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
    registerIpcHandlers({ ipcMain, clipboard });

    const mainDir = path.dirname(fileURLToPath(import.meta.url));
    createCapsuleWindow({
      preloadPath: path.join(mainDir, "../preload/index.cjs"),
      rendererFile: path.join(mainDir, "../renderer/index.html"),
      devServerUrl: process.env.REQRAFT_DESKTOP_DEV_SERVER,
    });
  });

  app.on("window-all-closed", () => {
    // An accessory app on macOS stays alive without windows.
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
