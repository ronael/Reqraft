import os from "node:os";
import process from "node:process";

export type ShellType = "bash" | "zsh" | "fish" | "powershell" | "unknown";

export function detectShell(): ShellType {
  const shellPath = process.env.SHELL ?? "";
  const lower = shellPath.toLowerCase();

  if (lower.includes("zsh")) return "zsh";
  if (lower.includes("bash")) return "bash";
  if (lower.includes("fish")) return "fish";
  // PowerShell as the login shell, which SHELL names outside Windows too.
  if (lower.includes("pwsh") || lower.includes("powershell")) return "powershell";

  if (process.platform === "win32") {
    const pwsh = process.env.PSModulePath;
    if (pwsh) return "powershell";
    const comSpec = process.env.ComSpec ?? "";
    if (comSpec.toLowerCase().includes("powershell")) return "powershell";
  }

  return "unknown";
}

/**
 * The account's home: HOME, or what the system knows of the account when HOME
 * is unset. Undefined when neither names one, rather than the root of the disk.
 */
function homeDirectory(): string | undefined {
  const fromEnvironment = process.env.HOME;
  if (fromEnvironment) {
    return fromEnvironment;
  }
  const fromSystem = os.homedir();
  return fromSystem === "" ? undefined : fromSystem;
}

export function getShellConfigPath(shell: ShellType): string | null {
  if (shell === "powershell" && process.platform === "win32") {
    const documents = process.env.USERPROFILE ?? homeDirectory();
    return documents === undefined
      ? null
      : `${documents}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`;
  }
  const home = homeDirectory();
  if (home === undefined) {
    return null;
  }
  switch (shell) {
    case "bash":
      return `${home}/.bashrc`;
    case "zsh":
      return `${home}/.zshrc`;
    case "fish":
      return `${home}/.config/fish/config.fish`;
    case "powershell":
      return `${home}/.config/powershell/Microsoft.PowerShell_profile.ps1`;
    default:
      return null;
  }
}
