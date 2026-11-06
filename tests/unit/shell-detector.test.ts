import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectShell, getShellConfigPath } from "@/apps/cli/aliases/detector.js";

/**
 * The detector reads the platform and the environment of the running process.
 * Both are stubbed in every case, so the suite answers the same on Linux, macOS
 * and Windows runners, whatever shell happened to launch it.
 */
function useProcess(platform: NodeJS.Platform, env: Record<string, string | undefined>): void {
  vi.spyOn(process, "platform", "get").mockReturnValue(platform);
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value);
  }
}

/** Nothing in the environment says which shell is running. */
const NO_SHELL_HINT = { SHELL: undefined, PSModulePath: undefined, ComSpec: undefined };

/**
 * The detector joins paths with `/`, which Windows accepts too. Normalising
 * compares the location itself rather than the separator spelling.
 */
function normalized(filePath: string | null): string | null {
  return filePath === null ? null : path.normalize(filePath);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("detectShell", () => {
  it.each([
    { shellPath: "/bin/zsh", expected: "zsh" },
    { shellPath: "/usr/local/bin/bash", expected: "bash" },
    { shellPath: "/opt/homebrew/bin/fish", expected: "fish" },
  ] as const)("recognises $expected from SHELL=$shellPath", ({ shellPath, expected }) => {
    useProcess("linux", { ...NO_SHELL_HINT, SHELL: shellPath });

    expect(detectShell()).toBe(expected);
  });

  it("prefers SHELL over the PowerShell markers on Windows, whatever its case (Git Bash)", () => {
    useProcess("win32", {
      SHELL: String.raw`C:\Program Files\Git\usr\bin\BASH.EXE`,
      PSModulePath: String.raw`C:\Program Files\PowerShell\7\Modules`,
      ComSpec: String.raw`C:\Windows\system32\cmd.exe`,
    });

    expect(detectShell()).toBe("bash");
  });

  it("recognises PowerShell on Windows from PSModulePath", () => {
    useProcess("win32", {
      ...NO_SHELL_HINT,
      PSModulePath: String.raw`C:\Users\dev\Documents\PowerShell\Modules`,
    });

    expect(detectShell()).toBe("powershell");
  });

  it("recognises PowerShell on Windows from ComSpec", () => {
    useProcess("win32", {
      ...NO_SHELL_HINT,
      ComSpec: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\PowerShell.exe`,
    });

    expect(detectShell()).toBe("powershell");
  });

  it("does not take cmd.exe for a supported shell", () => {
    useProcess("win32", { ...NO_SHELL_HINT, ComSpec: String.raw`C:\Windows\system32\cmd.exe` });

    expect(detectShell()).toBe("unknown");
  });

  it("only trusts the PowerShell markers on Windows", () => {
    useProcess("darwin", {
      ...NO_SHELL_HINT,
      PSModulePath: "/usr/local/microsoft/powershell/7/Modules",
      ComSpec: "/usr/local/bin/powershell",
    });

    expect(detectShell()).toBe("unknown");
  });

  it.each(["linux", "darwin", "win32"] as const)(
    "answers unknown on %s when nothing identifies the shell",
    (platform) => {
      useProcess(platform, NO_SHELL_HINT);

      expect(detectShell()).toBe("unknown");
    },
  );
});

describe("getShellConfigPath", () => {
  const home = path.resolve(os.tmpdir(), "reqraft-home");
  const userProfile = path.resolve(os.tmpdir(), "reqraft-user-profile");
  const powerShellProfile = "Microsoft.PowerShell_profile.ps1";

  it.each([
    { shell: "bash", segments: [".bashrc"] },
    { shell: "zsh", segments: [".zshrc"] },
    { shell: "fish", segments: [".config", "fish", "config.fish"] },
  ] as const)("keeps the $shell configuration under HOME", ({ shell, segments }) => {
    useProcess("linux", { HOME: home });

    expect(normalized(getShellConfigPath(shell))).toBe(path.join(home, ...segments));
  });

  it("puts the PowerShell profile in the Windows Documents folder", () => {
    useProcess("win32", { HOME: home, USERPROFILE: userProfile });

    expect(normalized(getShellConfigPath("powershell"))).toBe(
      path.join(userProfile, "Documents", "PowerShell", powerShellProfile),
    );
  });

  it("falls back to HOME for the PowerShell profile when Windows has no USERPROFILE", () => {
    useProcess("win32", { HOME: home, USERPROFILE: undefined });

    expect(normalized(getShellConfigPath("powershell"))).toBe(
      path.join(home, "Documents", "PowerShell", powerShellProfile),
    );
  });

  it("keeps the PowerShell profile under ~/.config outside Windows", () => {
    useProcess("darwin", { HOME: home, USERPROFILE: userProfile });

    expect(normalized(getShellConfigPath("powershell"))).toBe(
      path.join(home, ".config", "powershell", powerShellProfile),
    );
  });

  it("has no configuration file for an unknown shell", () => {
    expect(getShellConfigPath("unknown")).toBeNull();
  });
});
