/**
 * The shell side of "Reqraft in the terminal agents": which shell the user
 * has, which start-up file it reads, and the lines that make an agent hand its
 * draft to `rp edit`.
 *
 * Everything here is pure: the environment comes in as a value, and nothing
 * touches the disk. `setup.ts` does the reading and writing.
 */

export const SHELL_KINDS = ["zsh", "bash", "fish", "powershell"] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];

/** The editor command the agents receive in `VISUAL`. */
export const EDIT_COMMAND = "rp edit";

/** Lines between these markers belong to Reqraft and are rewritten whole. */
export const BLOCK_BEGIN = "# >>> reqraft agents >>>";
export const BLOCK_END = "# <<< reqraft agents <<<";

export interface ShellEnvironment {
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  /** The account's home directory, or undefined when nothing names one. */
  home: string | undefined;
}

export interface ShellTarget {
  kind: ShellKind;
  /** Absolute path of the start-up file the shell reads. */
  file: string;
  /** The same path as people write it, `~/.zshrc` rather than `/Users/…`. */
  displayFile: string;
}

const SHELL_LABELS: Record<ShellKind, string> = {
  zsh: "zsh",
  bash: "bash",
  fish: "fish",
  powershell: "PowerShell",
};

export function shellLabel(kind: ShellKind): string {
  return SHELL_LABELS[kind];
}

/** The login shell named by `SHELL`, or PowerShell on Windows; null otherwise. */
export function detectShellKind(environment: ShellEnvironment): ShellKind | null {
  const shell = (environment.env.SHELL ?? "").toLowerCase();
  const name = shell.split(/[\\/]/).pop() ?? "";
  if (name.startsWith("zsh")) return "zsh";
  if (name.startsWith("bash")) return "bash";
  if (name.startsWith("fish")) return "fish";
  if (name.startsWith("pwsh") || name.startsWith("powershell")) return "powershell";
  if (environment.platform === "win32") return "powershell";
  return null;
}

export function isShellKind(value: string): value is ShellKind {
  return (SHELL_KINDS as readonly string[]).includes(value);
}

/** The start-up file each shell reads for interactive sessions. */
export function shellTarget(kind: ShellKind, environment: ShellEnvironment): ShellTarget | null {
  const home =
    environment.platform === "win32"
      ? (environment.env.USERPROFILE ?? environment.home)
      : environment.home;
  if (home === undefined || home === "") return null;
  const separator = environment.platform === "win32" ? "\\" : "/";
  const join = (...parts: string[]): string => [home, ...parts].join(separator);

  let file: string;
  switch (kind) {
    case "zsh":
      file = join(".zshrc");
      break;
    case "bash":
      file = join(".bashrc");
      break;
    case "fish":
      file = join(".config", "fish", "config.fish");
      break;
    case "powershell":
      file =
        environment.platform === "win32"
          ? join("Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
          : join(".config", "powershell", "Microsoft.PowerShell_profile.ps1");
      break;
  }
  return { kind, file, displayFile: `~${file.slice(home.length)}` };
}

/** A path as people write it: the home directory shown as `~`. */
export function displayPath(file: string, home: string | undefined): string {
  if (home === undefined || home === "" || !file.startsWith(home)) return file;
  return `~${file.slice(home.length)}`;
}

/** An agent as the start-up file knows it: its command and the variable it reads. */
export interface WrappedAgent {
  command: string;
  variable: "VISUAL" | "EDITOR";
}

/**
 * One line that starts `command` with its editor variable set to `rp edit`,
 * for that command only: `git commit` and every other tool keep the user's
 * editor.
 */
export function wrapperLine(
  kind: ShellKind,
  command: string,
  variable: WrappedAgent["variable"] = "VISUAL",
): string {
  switch (kind) {
    case "zsh":
    case "bash":
      return `${command}() { ${variable}="${EDIT_COMMAND}" command ${command} "$@"; }`;
    case "fish":
      return `function ${command} --wraps ${command}; ${variable}="${EDIT_COMMAND}" command ${command} $argv; end`;
    case "powershell":
      // The variable is restored afterwards: PowerShell has no per-command
      // environment, and the session must not keep `rp edit` as its editor.
      return (
        `function ${command} { $previous = $env:${variable}; $env:${variable} = '${EDIT_COMMAND}'; ` +
        `try { & (Get-Command ${command} -CommandType Application | Select-Object -First 1) @args } ` +
        `finally { $env:${variable} = $previous } }`
      );
  }
}

/** The whole Reqraft block for these agents, markers included. */
export function renderBlock(kind: ShellKind, agents: readonly WrappedAgent[]): string {
  return [
    BLOCK_BEGIN,
    ...agents.map((agent) => wrapperLine(kind, agent.command, agent.variable)),
    BLOCK_END,
  ].join("\n");
}

interface BlockBounds {
  start: number;
  end: number;
}

function findBlock(content: string): BlockBounds | null {
  const start = content.indexOf(BLOCK_BEGIN);
  if (start === -1) return null;
  const endMarker = content.indexOf(BLOCK_END, start);
  if (endMarker === -1) return null;
  return { start, end: endMarker + BLOCK_END.length };
}

/** The commands the Reqraft block currently wraps, in the order it lists them. */
export function wrappedCommands(content: string): string[] {
  const bounds = findBlock(content);
  if (bounds === null) return [];
  return content
    .slice(bounds.start + BLOCK_BEGIN.length, bounds.end - BLOCK_END.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => /^(?:function\s+)?([A-Za-z0-9_.-]+)(?:\(\)|\s)/.exec(line)?.[1])
    .filter((command): command is string => command !== undefined);
}

/**
 * The start-up file with `block` in place of the current Reqraft block, or
 * without it when `block` is null. A new block goes at the end, after one
 * empty line; everything outside the markers is left byte for byte.
 */
export function withBlock(content: string, block: string | null): string {
  const bounds = findBlock(content);
  if (bounds !== null) {
    const before = content.slice(0, bounds.start);
    let after = content.slice(bounds.end);
    if (block !== null) return `${before}${block}${after}`;
    // Removing the block also removes the line break it ended with, and the
    // empty line added in front of it.
    after = after.replace(/^\r?\n/, "");
    return `${before.replace(/\n\n$/, "\n")}${after}`;
  }
  if (block === null) return content;
  if (content === "") return `${block}\n`;
  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${block}\n`;
}
