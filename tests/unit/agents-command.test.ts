import { describe, expect, it } from "vitest";
import type { AgentSpec } from "@/agents/catalog.js";
import { runAgents, type AgentsCommandDependencies } from "@/apps/cli/commands/agents.js";
import { createTranslator } from "@/i18n/translate.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

const t = createTranslator("fr");
const ZSHRC = "/Users/ada/.zshrc";
const AGENTS: AgentSpec[] = [
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    support: { kind: "editor", shortcut: "Ctrl+G", variable: "VISUAL" },
    featured: true,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    command: "claude",
    support: { kind: "editor", shortcut: "Ctrl+G", variable: "VISUAL" },
    featured: true,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    support: { kind: "none", reason: "no-editor" },
  },
];

function setup(
  overrides: Partial<AgentsCommandDependencies> = {},
  installed: Record<string, string> = {
    codex: "/opt/homebrew/bin/codex",
    gemini: "/Users/ada/.npm/bin/gemini",
  },
) {
  const files: Record<string, string> = { [ZSHRC]: "export PATH=x\n" };
  const log: string[] = [];
  const errors: string[] = [];
  const copied: string[] = [];
  const deps: AgentsCommandDependencies = {
    ports: {
      readText: (file) => Promise.resolve(files[file] ?? null),
      writeText: (file, content) => {
        files[file] = content;
        return Promise.resolve();
      },
      findExecutable: (command) => Promise.resolve(installed[command] ?? null),
    },
    environment: { env: { SHELL: "/bin/zsh" }, platform: "darwin", home: "/Users/ada" },
    output: { log: (m) => log.push(m), error: (m) => errors.push(m) },
    interactive: false,
    color: false,
    choose: () => Promise.resolve(null),
    confirm: () => Promise.resolve(true),
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    agents: AGENTS,
    ...overrides,
  };
  return { deps, files, log, errors, copied };
}

describe("rp agents", () => {
  it("liste les agents et dit lesquels ne sont pas pris en charge", async () => {
    const { deps, log } = setup();
    expect(await runAgents({}, t, deps)).toBe(EXIT_CODES.SUCCESS);
    expect(log[0]).toBe("Agents IA · shell zsh (~/.zshrc)");
    expect(log.join("\n")).toMatch(/● Codex\s+\/opt\/homebrew\/bin\/codex\s+non activé/);
    expect(log.join("\n")).toMatch(/○ Claude Code\s+non trouvé/);
    expect(log.join("\n")).toMatch(/○ Gemini CLI\s+~\/\.npm\/bin\/gemini\s+pas pris en charge/);
  });

  it("--enable --yes écrit les lignes des agents installés et dit comment s'en servir", async () => {
    const { deps, files, log } = setup();
    expect(await runAgents({ enable: true, yes: true }, t, deps)).toBe(EXIT_CODES.SUCCESS);
    expect(files[ZSHRC]).toContain('codex() { VISUAL="rp edit" command codex "$@"; }');
    expect(files[ZSHRC]).not.toContain("claude()");
    expect(log).toContain("✓ Codex : activé dans ~/.zshrc.");
    expect(log.at(-1)).toContain("Ctrl+G");
  });

  it("--print montre les lignes sans rien écrire", async () => {
    const { deps, files, log, errors } = setup();
    await runAgents({ print: true }, t, deps);
    expect(files[ZSHRC]).toBe("export PATH=x\n");
    expect(log[0]).toContain("# >>> reqraft agents >>>");
    expect(errors[0]).toContain("~/.zshrc");
  });

  it("--disable retire le bloc et rend le fichier d'origine", async () => {
    const { deps, files } = setup();
    await runAgents({ enable: true, yes: true }, t, deps);
    await runAgents({ disable: true }, t, deps);
    expect(files[ZSHRC]).toBe("export PATH=x\n");
  });

  it("au terminal, la consigne pour l'agent se copie, ou s'affiche si la copie échoue", async () => {
    const chosen = setup({ interactive: true, choose: () => Promise.resolve(2) });
    await runAgents({}, t, chosen.deps);
    expect(chosen.copied[0]).toContain("rp agents --enable --yes");

    const failing = setup({
      interactive: true,
      choose: () => Promise.resolve(2),
      copy: () => Promise.reject(new Error("no clipboard")),
    });
    await runAgents({}, t, failing.deps);
    expect(failing.log.join("\n")).toContain("npm install -g @reqraft/cli");
  });

  it("--prompt affiche la consigne, et --shell refuse un shell inconnu", async () => {
    const { deps, log, errors } = setup();
    await runAgents({ prompt: true }, t, deps);
    expect(log[0]).toContain("rp agents --enable --yes");
    expect(await runAgents({ shell: "tcsh" }, t, deps)).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.at(-1)).toContain("--shell");
  });
});
