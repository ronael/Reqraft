import path from "node:path";
import os from "node:os";
import process from "node:process";

export function getConfigDir(): string {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "rp");
  }

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "rp");
  }

  // Linux and others: follow XDG.
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, "rp");
  }
  return path.join(os.homedir(), ".config", "rp");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function getProfilesDir(): string {
  return path.join(getConfigDir(), "profiles");
}
