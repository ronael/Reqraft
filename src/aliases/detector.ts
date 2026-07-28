import process from "node:process";

export type ShellType = "bash" | "zsh" | "fish" | "powershell" | "unknown";

export function detectShell(): ShellType {
  const shellPath = process.env.SHELL ?? "";
  const lower = shellPath.toLowerCase();

  if (lower.includes("zsh")) return "zsh";
  if (lower.includes("bash")) return "bash";
  if (lower.includes("fish")) return "fish";

  if (process.platform === "win32") {
    const pwsh = process.env.PSModulePath;
    if (pwsh) return "powershell";
    const comSpec = process.env.ComSpec ?? "";
    if (comSpec.toLowerCase().includes("powershell")) return "powershell";
  }

  return "unknown";
}

export function getShellConfigPath(shell: ShellType): string | null {
  const home = process.env.HOME ?? "";
  switch (shell) {
    case "bash":
      return `${home}/.bashrc`;
    case "zsh":
      return `${home}/.zshrc`;
    case "fish":
      return `${home}/.config/fish/config.fish`;
    case "powershell":
      if (process.platform === "win32") {
        const documents = process.env.USERPROFILE ?? home;
        return `${documents}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`;
      }
      return `${home}/.config/powershell/Microsoft.PowerShell_profile.ps1`;
    default:
      return null;
  }
}
