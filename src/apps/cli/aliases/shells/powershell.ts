import type { ShellHandler } from "./types.js";

export const powershellHandler: ShellHandler = {
  name: "PowerShell",
  beginMarker: "# >>> rp aliases >>>",
  endMarker: "# <<< rp aliases <<<",
  formatAlias(alias: string): string {
    return `Set-Alias -Name ${alias} -Value rp`;
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
