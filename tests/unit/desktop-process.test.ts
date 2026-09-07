import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfigDir } from "@/config/paths.js";
import {
  desktopExecutable,
  desktopTestConfigDirectory,
  desktopTestEnvironment,
} from "../e2e/desktop-process.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("desktop E2E process isolation", () => {
  const home = path.resolve(os.tmpdir(), "reqraft test é isolated");

  it.each(["darwin", "linux", "win32"] as const)(
    "writes fixtures where the %s application will read them",
    (platform) => {
      const env = desktopTestEnvironment(home, {
        APPDATA: path.resolve("real-user", "Roaming"),
        XDG_CONFIG_HOME: path.resolve("real-user", ".config"),
      });
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      vi.spyOn(process, "platform", "get").mockReturnValue(platform);
      vi.spyOn(os, "homedir").mockReturnValue(home);

      const configDirectory = desktopTestConfigDirectory(home, platform);
      expect(configDirectory).toBe(getConfigDir());
      expect(path.relative(home, configDirectory)).not.toMatch(/^\.\./);
    },
  );

  it("redirects Windows profile and application data without mutating the parent", () => {
    const inherited = {
      USERPROFILE: "real-profile",
      APPDATA: "real-roaming",
      LOCALAPPDATA: "real-local",
      ELECTRON_RUN_AS_NODE: "1",
      REQRAFT_DESKTOP_E2E_PROBE: "1",
    };
    const env = desktopTestEnvironment(home, inherited);

    expect(env.USERPROFILE).toBe(home);
    expect(env.APPDATA).toBe(path.join(home, "AppData", "Roaming"));
    expect(env.LOCALAPPDATA).toBe(path.join(home, "AppData", "Local"));
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.REQRAFT_DESKTOP_E2E_PROBE).toBe("1");
    expect(inherited.APPDATA).toBe("real-roaming");
    expect(inherited.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("removes inherited case variants of isolated environment keys", () => {
    // Windows treats names case-insensitively; duplicate spellings must not
    // allow spawn to choose an inherited path instead of the isolated one.
    const env = desktopTestEnvironment(home, {
      AppData: "real-roaming",
      LocalAppData: "real-local",
      UserProfile: "real-profile",
      Home: "real-home",
      electron_run_as_node: "1",
    });
    expect(env.AppData).toBeUndefined();
    expect(env.LocalAppData).toBeUndefined();
    expect(env.UserProfile).toBeUndefined();
    expect(env.Home).toBeUndefined();
    expect(env.electron_run_as_node).toBeUndefined();
    expect(env.HOME).toBe(home);
  });

  it("launches the installed Electron executable directly, without a shell shim", () => {
    const executable = desktopExecutable();
    expect(path.isAbsolute(executable)).toBe(true);
    expect(existsSync(executable)).toBe(true);
    expect(executable).not.toContain(`${path.sep}.bin${path.sep}`);
    expect(executable).not.toMatch(/\.(cmd|bat)$/i);
  });
});
