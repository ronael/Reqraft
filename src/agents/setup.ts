import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { AGENTS, type AgentSpec } from "./catalog.js";
import {
  detectShellKind,
  renderBlock,
  shellTarget,
  withBlock,
  wrappedCommands,
  type ShellEnvironment,
  type ShellKind,
  type ShellTarget,
  type WrappedAgent,
} from "./shell.js";

/**
 * Reading and changing which agents hand their draft to `rp edit`.
 *
 * The disk and the executable lookup come in as ports: the CLI passes
 * `node:fs` and its own `PATH`, the desktop app the login shell's `PATH`,
 * because an app started from the Finder does not inherit it.
 */
export interface AgentsPorts {
  /** The file's text, or null when it does not exist. */
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  /** Where `command` runs from, or null when it is not installed. */
  findExecutable(command: string): Promise<string | null>;
}

export interface AgentsOptions {
  /** Overrides the detected shell, for `rp agents --shell`. */
  shell?: ShellKind;
  agents?: readonly AgentSpec[];
}

export interface AgentState {
  spec: AgentSpec;
  /** Where the agent was found; null when it is not installed. */
  path: string | null;
  enabled: boolean;
}

export interface AgentsStatus {
  /** Null when the shell is not one Reqraft can write for. */
  shell: ShellTarget | null;
  agents: AgentState[];
}

export async function readAgentsStatus(
  ports: AgentsPorts,
  environment: ShellEnvironment,
  options: AgentsOptions = {},
): Promise<AgentsStatus> {
  const kind = options.shell ?? detectShellKind(environment);
  const shell = kind === null ? null : shellTarget(kind, environment);
  const content = shell === null ? "" : ((await ports.readText(shell.file)) ?? "");
  const wrapped = new Set(wrappedCommands(content));
  const agents = await Promise.all(
    (options.agents ?? AGENTS).map(async (spec) => ({
      spec,
      path: await ports.findExecutable(spec.command),
      enabled: spec.support.kind === "editor" && wrapped.has(spec.command),
    })),
  );
  return { shell, agents };
}

/**
 * Turns `agentIds` on or off and rewrites the shell's start-up file once.
 * The block lists the agents in catalogue order, so the file does not change
 * when nothing changed.
 */
export async function setAgentsEnabled(
  ports: AgentsPorts,
  environment: ShellEnvironment,
  agentIds: readonly string[],
  enabled: boolean,
  options: AgentsOptions = {},
): Promise<AgentsStatus> {
  const catalogue = options.agents ?? AGENTS;
  const status = await readAgentsStatus(ports, environment, options);
  const shell = status.shell;
  if (shell === null) {
    throw new ReqraftError("agents.shell_unknown", EXIT_CODES.INVALID_CONFIGURATION);
  }

  const wrapped = new Set(
    status.agents.filter((agent) => agent.enabled).map((a) => a.spec.command),
  );
  for (const id of agentIds) {
    const spec = catalogue.find((agent) => agent.id === id);
    if (spec === undefined) {
      throw new ReqraftError("agents.unknown", EXIT_CODES.INVALID_INPUT, { params: { agent: id } });
    }
    if (spec.support.kind !== "editor") {
      throw new ReqraftError("agents.unsupported", EXIT_CODES.INVALID_INPUT, {
        params: { agent: spec.label },
      });
    }
    if (enabled) wrapped.add(spec.command);
    else wrapped.delete(spec.command);
  }

  const wrappedAgents = catalogue.flatMap((agent) =>
    agent.support.kind === "editor" && wrapped.has(agent.command)
      ? [{ command: agent.command, variable: agent.support.variable }]
      : [],
  );
  await writeBlock(ports, shell, wrappedAgents);
  return readAgentsStatus(ports, environment, options);
}

async function writeBlock(
  ports: AgentsPorts,
  shell: ShellTarget,
  agents: readonly WrappedAgent[],
): Promise<void> {
  const content = (await ports.readText(shell.file)) ?? "";
  const next = withBlock(content, agents.length === 0 ? null : renderBlock(shell.kind, agents));
  if (next !== content) await ports.writeText(shell.file, next);
}

/** The block Enable would write for these agents, for people who paste it themselves. */
export function blockFor(shell: ShellTarget, agents: readonly AgentSpec[]): string {
  return renderBlock(
    shell.kind,
    agents.flatMap((agent) =>
      agent.support.kind === "editor"
        ? [{ command: agent.command, variable: agent.support.variable }]
        : [],
    ),
  );
}

/** Listed to the user: installed agents, and the featured ones even when missing. */
export function listedAgents(status: AgentsStatus): AgentState[] {
  return status.agents.filter((agent) => agent.path !== null || agent.spec.featured === true);
}

/** Supported agents that are neither installed nor featured: named in one line. */
export function otherSupportedAgents(status: AgentsStatus): AgentSpec[] {
  return status.agents
    .filter(
      (agent) =>
        agent.spec.support.kind === "editor" && agent.path === null && agent.spec.featured !== true,
    )
    .map((agent) => agent.spec);
}

/** Installed, supported and not yet enabled: what `rp agents --enable` would add. */
export function enableCandidates(status: AgentsStatus): AgentState[] {
  return status.agents.filter(
    (agent) => agent.spec.support.kind === "editor" && agent.path !== null && !agent.enabled,
  );
}
