import type { ShellHandler } from "./types.js";

export const powershellHandler: ShellHandler = {
  name: "PowerShell",
  beginMarker: "# >>> rp aliases >>>",
  endMarker: "# <<< rp aliases <<<",
  formatAlias(alias: string): string {
    return `Set-Alias -Name ${alias} -Value rp`;
  },
  reloadCommand(configPath: string): string {
    // PowerShell has no `source`: dot-sourcing runs the profile in the current
    // session. Single quotes keep the path literal, spaces included; a quote
    // inside them is doubled.
    return `. '${configPath.replaceAll("'", "''")}'`;
  },
  parseExisting(content: string): { before: string; inside: string; after: string } {
    const beginIndex = content.indexOf(this.beginMarker);
    const endIndex = content.indexOf(this.endMarker);
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
      return { before: content, inside: "", after: "" };
    }
    return {
      before: content.slice(0, beginIndex),
      inside: content.slice(beginIndex + this.beginMarker.length, endIndex),
      after: content.slice(endIndex + this.endMarker.length),
    };
  },
};
