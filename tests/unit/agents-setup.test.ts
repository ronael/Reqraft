import { describe, expect, it } from "vitest";
import type { AgentSpec } from "@/agents/catalog.js";
import { readAgentsStatus, setAgentsEnabled, type AgentsPorts } from "@/agents/setup.js";
import type { ShellEnvironment } from "@/agents/shell.js";
import { ReqraftError } from "@/core/errors.js";

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
    id: "other",
    label: "Other CLI",
    command: "other",
    support: { kind: "none", reason: "no-editor" },
  },
];

const environment: ShellEnvironment = {
  env: { SHELL: "/bin/zsh" },
  platform: "darwin",
  home: "/Users/ada",
};

function memoryPorts(
  files: Record<string, string>,
  installed: Record<string, string>,
): AgentsPorts & { files: Record<string, string> } {
  return {
    files,
    readText: (file) => Promise.resolve(files[file] ?? null),
    writeText: (file, content) => {
      files[file] = content;
      return Promise.resolve();
    },
    findExecutable: (command) => Promise.resolve(installed[command] ?? null),
  };
}

const ZSHRC = "/Users/ada/.zshrc";

describe("l'état des agents", () => {
  it("dit lesquels sont installés, branchés, ou impossibles à brancher", async () => {
    const ports = memoryPorts(
      {
        [ZSHRC]:
          'export PATH=x\n\n# >>> reqraft agents >>>\ncodex() { VISUAL="rp edit" command codex "$@"; }\n# <<< reqraft agents <<<\n',
      },
      { codex: "/opt/homebrew/bin/codex", other: "/usr/local/bin/other" },
    );
    const status = await readAgentsStatus(ports, environment, { agents: AGENTS });
    expect(status.shell?.displayFile).toBe("~/.zshrc");
    expect(
      status.agents.map((agent) => [agent.spec.id, agent.path !== null, agent.enabled]),
    ).toEqual([
      ["codex", true, true],
      ["claude-code", false, false],
      ["other", true, false],
    ]);
  });
});

describe("activer et désactiver", () => {
  it("écrit un seul bloc, dans l'ordre du catalogue, et garde le reste du fichier", async () => {
    const ports = memoryPorts(
      { [ZSHRC]: "export PATH=x\n" },
      { codex: "/opt/homebrew/bin/codex", claude: "/Users/ada/.local/bin/claude" },
    );
    await setAgentsEnabled(ports, environment, ["claude-code"], true, { agents: AGENTS });
    await setAgentsEnabled(ports, environment, ["codex"], true, { agents: AGENTS });
    expect(ports.files[ZSHRC]).toBe(
      [
        "export PATH=x",
        "",
        "# >>> reqraft agents >>>",
        'codex() { VISUAL="rp edit" command codex "$@"; }',
        'claude() { VISUAL="rp edit" command claude "$@"; }',
        "# <<< reqraft agents <<<",
        "",
      ].join("\n"),
    );

    await setAgentsEnabled(ports, environment, ["codex", "claude-code"], false, { agents: AGENTS });
    expect(ports.files[ZSHRC]).toBe("export PATH=x\n");
  });

  it("écrit pour le shell demandé, pas seulement pour celui de SHELL", async () => {
    const ports = memoryPorts({}, { codex: "/usr/bin/codex" });
    const status = await setAgentsEnabled(ports, environment, ["codex"], true, {
      agents: AGENTS,
      shell: "fish",
    });
    expect(status.shell?.displayFile).toBe("~/.config/fish/config.fish");
    expect(ports.files["/Users/ada/.config/fish/config.fish"]).toContain(
      'function codex --wraps codex; VISUAL="rp edit" command codex $argv; end',
    );
  });

  it("refuse un agent qui n'ouvre pas d'éditeur, et un shell inconnu", async () => {
    const ports = memoryPorts({}, {});
    await expect(
      setAgentsEnabled(ports, environment, ["other"], true, { agents: AGENTS }),
    ).rejects.toMatchObject({ errorCode: "agents.unsupported" });
    await expect(
      setAgentsEnabled(ports, { ...environment, env: { SHELL: "/bin/tcsh" } }, ["codex"], true, {
        agents: AGENTS,
      }),
    ).rejects.toBeInstanceOf(ReqraftError);
  });
});
