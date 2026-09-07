import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function desktopExecutable(): string {
  // Electron's Node entry exports the installed binary path (also used by
  // its own CLI). A .cmd shim cannot be spawned directly on Windows.
  const executable: unknown = require("electron");
  if (typeof executable !== "string") {
    throw new Error("The desktop E2E launcher must run under Node.js.");
  }
  return executable;
}

export function desktopTestEnvironment(
  home: string,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const isolated = {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
  };
  const replacedKeys = new Set([...Object.keys(isolated), "ELECTRON_RUN_AS_NODE"]);
  // On Windows environment names are case-insensitive. Remove every spelling
  // before setting the paths so spawn cannot select an inherited duplicate.
  const env = Object.fromEntries(
    Object.entries(inherited).filter(([key]) => !replacedKeys.has(key.toUpperCase())),
  );
  return { ...env, ...isolated };
}

export function desktopTestConfigDirectory(
  home: string,
  platform: NodeJS.Platform = process.platform,
): string {
  // Checked against config/paths.ts by desktop-process.test.ts, using the
  // environment passed to the child instead of the test runner's profile.
  if (platform === "win32") return path.join(home, "AppData", "Roaming", "rp");
  return platform === "darwin"
    ? path.join(home, "Library", "Application Support", "rp")
    : path.join(home, ".config", "rp");
}
