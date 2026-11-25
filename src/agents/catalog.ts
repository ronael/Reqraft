/**
 * The terminal agents Reqraft knows about.
 *
 * An agent is supported when it can hand its current draft to an external
 * editor and take it back: it writes the draft to a file, runs `$VISUAL` (or
 * `$EDITOR`) on it, waits, then reads the file into its input. `rp edit` is
 * that editor. Agents without such a hook are still listed, with the reason,
 * so nobody looks for a switch that cannot exist.
 *
 * Checked against each agent's source code (or its documentation, where the
 * source is closed) on 2026-11-25; see docs/terminal-agents.md for the references.
 */

export type EditorVariable = "VISUAL" | "EDITOR";

/** Why an agent cannot use `rp edit`, worded for the user by the caller. */
export type UnsupportedReason =
  /** It never opens an external editor. */
  | "no-editor"
  /** Its editor composes a new prompt and sends it, without giving it back. */
  | "sends-directly"
  /** It runs the editor as a single path, so `rp edit` cannot be named. */
  | "no-arguments"
  /** Documented, but not checked in its code yet. */
  | "unverified";

export type AgentSupport =
  | {
      kind: "editor";
      /** The key that opens the editor in that agent, as its own help names it. */
      shortcut: string;
      /** The variable it reads; most read VISUAL first, Crush only EDITOR. */
      variable: EditorVariable;
    }
  | { kind: "none"; reason: UnsupportedReason };

export interface AgentSpec {
  id: string;
  label: string;
  /** The executable the user types to start it. */
  command: string;
  support: AgentSupport;
  /** Listed even when not installed: the agents most people come for. */
  featured?: boolean;
}

const editor = (shortcut: string, variable: EditorVariable = "VISUAL"): AgentSupport => ({
  kind: "editor",
  shortcut,
  variable,
});
const none = (reason: UnsupportedReason): AgentSupport => ({ kind: "none", reason });

export const AGENTS: readonly AgentSpec[] = [
  { id: "codex", label: "Codex", command: "codex", support: editor("Ctrl+G"), featured: true },
  {
    id: "claude-code",
    label: "Claude Code",
    command: "claude",
    support: editor("Ctrl+G"),
    featured: true,
  },
  { id: "gemini", label: "Gemini CLI", command: "gemini", support: editor("Ctrl+G") },
  { id: "copilot", label: "GitHub Copilot CLI", command: "copilot", support: editor("Ctrl+G") },
  { id: "opencode", label: "opencode", command: "opencode", support: editor("Ctrl+X E") },
  { id: "kimi", label: "Kimi Code", command: "kimi", support: editor("Ctrl+G") },
  { id: "pi", label: "pi", command: "pi", support: editor("Ctrl+G") },
  { id: "vibe", label: "Mistral Vibe", command: "vibe", support: editor("Ctrl+G") },
  { id: "aider", label: "Aider", command: "aider", support: editor("Ctrl+X Ctrl+E") },
  { id: "crush", label: "Crush", command: "crush", support: editor("Ctrl+O", "EDITOR") },
  { id: "grok", label: "Grok Build", command: "grok", support: editor("Ctrl+G") },
  { id: "qwen", label: "Qwen Code", command: "qwen", support: none("no-arguments") },
  { id: "cursor", label: "Cursor CLI", command: "cursor-agent", support: none("unverified") },
  { id: "amp", label: "Amp", command: "amp", support: none("unverified") },
  { id: "goose", label: "goose", command: "goose", support: none("sends-directly") },
  { id: "kiro", label: "Kiro CLI", command: "kiro-cli", support: none("sends-directly") },
];

export function supportedAgents(agents: readonly AgentSpec[] = AGENTS): AgentSpec[] {
  return agents.filter((agent) => agent.support.kind === "editor");
}

export function findAgent(
  id: string,
  agents: readonly AgentSpec[] = AGENTS,
): AgentSpec | undefined {
  return agents.find((agent) => agent.id === id);
}

/** The variable `rp edit` must be named in for this agent; null when unsupported. */
export function editorVariable(agent: AgentSpec): EditorVariable | null {
  return agent.support.kind === "editor" ? agent.support.variable : null;
}

/** The message key that words an unsupported agent's reason. */
export const UNSUPPORTED_REASON_KEYS = {
  "no-editor": "agents.reason.noEditor",
  "sends-directly": "agents.reason.sendsDirectly",
  "no-arguments": "agents.reason.noArguments",
  unverified: "agents.reason.unverified",
} as const satisfies Record<UnsupportedReason, string>;
