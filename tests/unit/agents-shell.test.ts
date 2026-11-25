import { describe, expect, it } from "vitest";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  detectShellKind,
  displayPath,
  renderBlock,
  shellTarget,
  SHELL_KINDS,
  withBlock,
  wrappedCommands,
  wrapperLine,
  type ShellEnvironment,
} from "@/agents/shell.js";

const mac = (shell?: string): ShellEnvironment => ({
  env: { SHELL: shell },
  platform: "darwin",
  home: "/Users/ada",
});

describe("le shell de l'utilisateur", () => {
  it("se lit dans SHELL, et vaut PowerShell sous Windows faute de mieux", () => {
    expect(detectShellKind(mac("/bin/zsh"))).toBe("zsh");
    expect(detectShellKind(mac("/opt/homebrew/bin/bash"))).toBe("bash");
    expect(detectShellKind(mac("/usr/local/bin/fish"))).toBe("fish");
    expect(detectShellKind(mac("/usr/local/bin/pwsh"))).toBe("powershell");
    expect(detectShellKind({ env: {}, platform: "win32", home: "C:\\Users\\ada" })).toBe(
      "powershell",
    );
    expect(detectShellKind(mac("/bin/tcsh"))).toBeNull();
    expect(detectShellKind(mac())).toBeNull();
  });

  it("nomme le fichier de démarrage de chaque shell, comme on l'écrit", () => {
    expect(shellTarget("zsh", mac())).toEqual({
      kind: "zsh",
      file: "/Users/ada/.zshrc",
      displayFile: "~/.zshrc",
    });
    expect(shellTarget("bash", mac())?.displayFile).toBe("~/.bashrc");
    expect(shellTarget("fish", mac())?.displayFile).toBe("~/.config/fish/config.fish");
    expect(
      shellTarget("powershell", {
        env: { USERPROFILE: "C:\\Users\\ada" },
        platform: "win32",
        home: "C:\\Users\\ada",
      })?.file,
    ).toBe("C:\\Users\\ada\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1");
    expect(shellTarget("zsh", { env: {}, platform: "darwin", home: undefined })).toBeNull();
  });

  it("raccourcit le dossier personnel en ~, et laisse les autres chemins tels quels", () => {
    expect(displayPath("/Users/ada/.local/bin/claude", "/Users/ada")).toBe("~/.local/bin/claude");
    expect(displayPath("/opt/homebrew/bin/codex", "/Users/ada")).toBe("/opt/homebrew/bin/codex");
  });
});

describe("les lignes qui branchent un agent", () => {
  it("donnent VISUAL à cet agent seulement, dans la syntaxe de chaque shell", () => {
    expect(wrapperLine("zsh", "codex")).toBe('codex() { VISUAL="rp edit" command codex "$@"; }');
    expect(wrapperLine("bash", "claude")).toBe(
      'claude() { VISUAL="rp edit" command claude "$@"; }',
    );
    expect(wrapperLine("fish", "codex")).toBe(
      'function codex --wraps codex; VISUAL="rp edit" command codex $argv; end',
    );
    // Crush reads only EDITOR: its line names that variable instead.
    expect(wrapperLine("zsh", "crush", "EDITOR")).toBe(
      'crush() { EDITOR="rp edit" command crush "$@"; }',
    );
    const powershell = wrapperLine("powershell", "codex");
    expect(powershell).toMatch(/^function codex \{/);
    // The session keeps its own editor afterwards.
    expect(powershell).toContain("finally { $env:VISUAL = $previous }");
  });

  it.each(SHELL_KINDS)("se relisent depuis le bloc en %s", (kind) => {
    const block = renderBlock(kind, [
      { command: "codex", variable: "VISUAL" },
      { command: "claude", variable: "VISUAL" },
    ]);
    expect(block.startsWith(BLOCK_BEGIN)).toBe(true);
    expect(block.endsWith(BLOCK_END)).toBe(true);
    expect(wrappedCommands(`export PATH=x\n\n${block}\n`)).toEqual(["codex", "claude"]);
  });
});

describe("le bloc dans le fichier de démarrage", () => {
  const block = renderBlock("zsh", [{ command: "codex", variable: "VISUAL" }]);

  it("s'ajoute à la fin, après une ligne vide, et se retire sans rien laisser", () => {
    for (const original of ["", "export PATH=x\n", "export PATH=x"]) {
      const added = withBlock(original, block);
      expect(added.endsWith(`${block}\n`)).toBe(true);
      expect(wrappedCommands(added)).toEqual(["codex"]);
      const removed = withBlock(added, null);
      expect(removed).toBe(original === "export PATH=x" ? "export PATH=x\n" : original);
    }
  });

  it("se remplace sur place, sans toucher au reste ni se dupliquer", () => {
    const before = `alias ll="ls -l"\n\n${block}\nexport EDITOR=vim\n`;
    const both = renderBlock("zsh", [
      { command: "codex", variable: "VISUAL" },
      { command: "claude", variable: "VISUAL" },
    ]);
    const after = withBlock(before, both);
    expect(after).toBe(`alias ll="ls -l"\n\n${both}\nexport EDITOR=vim\n`);
    expect(withBlock(after, both)).toBe(after);
  });

  it("ne change rien à un fichier qui n'en a pas quand on le retire", () => {
    expect(withBlock("export PATH=x\n", null)).toBe("export PATH=x\n");
  });
});
