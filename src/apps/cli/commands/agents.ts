import os from "node:os";
import process from "node:process";
import readline from "node:readline";
import { AGENTS, UNSUPPORTED_REASON_KEYS, type AgentSpec } from "@/agents/catalog.js";
import { nodeAgentsPorts } from "@/agents/node-ports.js";
import {
  blockFor,
  enableCandidates,
  listedAgents,
  otherSupportedAgents,
  readAgentsStatus,
  setAgentsEnabled,
  type AgentState,
  type AgentsPorts,
  type AgentsStatus,
} from "@/agents/setup.js";
import {
  displayPath,
  isShellKind,
  shellLabel,
  type ShellEnvironment,
  type ShellKind,
  type ShellTarget,
} from "@/agents/shell.js";
import { writeClipboard } from "@/apps/cli/clipboard/clipboard.js";
import { normalizeReqraftError } from "@/core/errors.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";
import { detectColor } from "@/shared/terminal/capabilities.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { choose } from "./keys.js";

/**
 * `rp agents`: shows which terminal agents can hand their draft to Reqraft,
 * and turns that on in the shell's start-up file — by writing the lines, by
 * printing them, or by handing the user instructions for their own agent.
 */
export interface AgentsCommandOptions {
  enable?: boolean;
  disable?: boolean;
  print?: boolean;
  prompt?: boolean;
  yes?: boolean;
  shell?: string;
}

export interface AgentsCommandDependencies {
  ports: AgentsPorts;
  environment: ShellEnvironment;
  output: { log(message: string): void; error(message: string): void };
  /** Whether a person is there to answer: a terminal on both ends. */
  interactive: boolean;
  color: boolean;
  choose(question: string, options: readonly string[]): Promise<number | null>;
  confirm(question: string): Promise<boolean>;
  copy(text: string): Promise<void>;
  agents?: readonly AgentSpec[];
}

const DEFAULT_TRANSLATOR = createTranslator("fr");
const SHELL_UNKNOWN = "agents.shellUnknown";

export function defaultAgentsDependencies(): AgentsCommandDependencies {
  const color = detectColor(process.env, process.stdout.isTTY);
  return {
    ports: nodeAgentsPorts(process.env.PATH),
    environment: { env: process.env, platform: process.platform, home: os.homedir() || undefined },
    output: console,
    interactive: process.stdin.isTTY && process.stdout.isTTY,
    color,
    choose: (question, options) =>
      choose(question, options, {
        input: process.stdin,
        output: process.stdout,
        highlight: (line) => (color ? `\u001B[1;35m${line}\u001B[0m` : line),
      }),
    confirm: ask,
    copy: writeClipboard,
  };
}

function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.once("close", () => {
      resolve(false);
    });
    rl.question(question, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "" || ["o", "oui", "y", "yes"].includes(normalized));
      rl.close();
    });
  });
}

export async function runAgents(
  options: AgentsCommandOptions,
  t: Translator = DEFAULT_TRANSLATOR,
  deps: AgentsCommandDependencies = defaultAgentsDependencies(),
): Promise<number> {
  const { output } = deps;
  if (options.prompt === true) {
    output.log(t("agents.setupPrompt"));
    return EXIT_CODES.SUCCESS;
  }
  if (options.shell !== undefined && !isShellKind(options.shell)) {
    output.error(t(SHELL_UNKNOWN));
    return EXIT_CODES.INVALID_INPUT;
  }

  const settings = { shell: options.shell, agents: deps.agents ?? AGENTS };
  try {
    const status = await readAgentsStatus(deps.ports, deps.environment, settings);
    if (options.disable === true) return await disable(status, deps, settings, t);
    if (options.enable === true)
      return await enable(status, deps, settings, options.yes === true, t);
    if (options.print === true) return printLines(status, deps, t);

    report(status, deps, t);
    const candidates = enableCandidates(status);
    if (!deps.interactive || candidates.length === 0 || status.shell === null) {
      return EXIT_CODES.SUCCESS;
    }
    output.log("");
    output.log(t("agents.linesFor", { file: status.shell.displayFile }));
    output.log(
      indent(
        blockFor(
          status.shell,
          candidates.map((agent) => agent.spec),
        ),
      ),
    );
    output.log("");
    const choice = await deps.choose(t("agents.choose"), [
      t("agents.choice.write"),
      t("agents.choice.print"),
      t("agents.choice.prompt"),
      t("agents.choice.later"),
    ]);
    switch (choice) {
      case 0:
        return await enable(status, deps, settings, true, t);
      case 1:
        output.log(t("agents.pasteHint", { file: status.shell.displayFile }));
        return EXIT_CODES.SUCCESS;
      case 2:
        return await copyPrompt(deps, t);
      default:
        return EXIT_CODES.SUCCESS;
    }
  } catch (error) {
    output.error(`${t("common.error")} : ${formatUiError(error, "agents", t)}`);
    return normalizeReqraftError(error).exitCode;
  }
}

function report(status: AgentsStatus, deps: AgentsCommandDependencies, t: Translator): void {
  const { output } = deps;
  output.log(
    status.shell === null
      ? t("agents.headingNoShell")
      : t("agents.heading", {
          shell: shellLabel(status.shell.kind),
          file: status.shell.displayFile,
        }),
  );
  if (status.shell === null) output.error(t(SHELL_UNKNOWN));

  const shown = listedAgents(status);
  const where = (agent: AgentState): string =>
    agent.path === null ? t("agents.notFound") : displayPath(agent.path, deps.environment.home);
  const width = Math.max(...shown.map((agent) => agent.spec.label.length));
  const whereWidth = Math.max(...shown.map((agent) => where(agent).length));
  for (const agent of shown) {
    const usable = agent.spec.support.kind === "editor" && agent.path !== null;
    const mark = usable ? paint("●", "32", deps.color) : paint("○", "2", deps.color);
    const location = paint(where(agent).padEnd(whereWidth), "2", deps.color);
    output.log(
      `  ${mark} ${agent.spec.label.padEnd(width)}  ${location}  ${stateOf(agent, t)}`.trimEnd(),
    );
  }
  const others = otherSupportedAgents(status);
  if (others.length > 0) {
    output.log(
      paint(
        t("agents.alsoSupported", { agents: others.map((agent) => agent.label).join(", ") }),
        "2",
        deps.color,
      ),
    );
  }
}

function stateOf(agent: AgentState, t: Translator): string {
  if (agent.spec.support.kind !== "editor") {
    return t(UNSUPPORTED_REASON_KEYS[agent.spec.support.reason]);
  }
  if (agent.path === null) return "";
  return agent.enabled ? t("agents.on") : t("agents.off");
}

async function enable(
  status: AgentsStatus,
  deps: AgentsCommandDependencies,
  settings: { shell?: ShellKind; agents: readonly AgentSpec[] },
  skipConfirmation: boolean,
  t: Translator,
): Promise<number> {
  const shell = requireShell(status, deps, t);
  if (shell === null) return EXIT_CODES.INVALID_CONFIGURATION;
  const candidates = enableCandidates(status);
  if (candidates.length === 0) {
    deps.output.log(t("agents.nothingToEnable"));
    return EXIT_CODES.SUCCESS;
  }
  if (!skipConfirmation && deps.interactive) {
    deps.output.log(t("agents.linesFor", { file: shell.displayFile }));
    deps.output.log(
      indent(
        blockFor(
          shell,
          candidates.map((agent) => agent.spec),
        ),
      ),
    );
    if (!(await deps.confirm(t("agents.confirm", { file: shell.displayFile })))) {
      return EXIT_CODES.SUCCESS;
    }
  }
  await setAgentsEnabled(
    deps.ports,
    deps.environment,
    candidates.map((agent) => agent.spec.id),
    true,
    settings,
  );
  const labels = candidates.map((agent) => agent.spec.label).join(", ");
  deps.output.log(
    paint(t("agents.enabledDone", { agents: labels, file: shell.displayFile }), "32", deps.color),
  );
  deps.output.log(t("agents.howTo", { shortcut: shortcutOf(candidates) }));
  return EXIT_CODES.SUCCESS;
}

async function disable(
  status: AgentsStatus,
  deps: AgentsCommandDependencies,
  settings: { shell?: ShellKind; agents: readonly AgentSpec[] },
  t: Translator,
): Promise<number> {
  const shell = requireShell(status, deps, t);
  if (shell === null) return EXIT_CODES.INVALID_CONFIGURATION;
  await setAgentsEnabled(
    deps.ports,
    deps.environment,
    settings.agents.filter((agent) => agent.support.kind === "editor").map((agent) => agent.id),
    false,
    settings,
  );
  deps.output.log(t("agents.disabledDone", { file: shell.displayFile }));
  return EXIT_CODES.SUCCESS;
}

function printLines(status: AgentsStatus, deps: AgentsCommandDependencies, t: Translator): number {
  const shell = requireShell(status, deps, t);
  if (shell === null) return EXIT_CODES.INVALID_CONFIGURATION;
  const installed = enableCandidates(status).map((agent) => agent.spec);
  // Nothing installed yet: the lines for every supported agent still work,
  // and do nothing until the agent arrives.
  const agents = installed.length > 0 ? installed : status.agents.map((agent) => agent.spec);
  deps.output.log(blockFor(shell, agents));
  deps.output.error(t("agents.pasteHint", { file: shell.displayFile }));
  return EXIT_CODES.SUCCESS;
}

async function copyPrompt(deps: AgentsCommandDependencies, t: Translator): Promise<number> {
  const prompt = t("agents.setupPrompt");
  try {
    await deps.copy(prompt);
    deps.output.log(t("agents.promptCopied"));
  } catch {
    deps.output.log(t("agents.promptCopyFailed"));
    deps.output.log(prompt);
  }
  return EXIT_CODES.SUCCESS;
}

function requireShell(
  status: AgentsStatus,
  deps: AgentsCommandDependencies,
  t: Translator,
): ShellTarget | null {
  if (status.shell === null) deps.output.error(t(SHELL_UNKNOWN));
  return status.shell;
}

function shortcutOf(agents: readonly AgentState[]): string {
  const shortcuts = new Set(
    agents.map((agent) =>
      agent.spec.support.kind === "editor" ? agent.spec.support.shortcut : "",
    ),
  );
  return [...shortcuts].filter(Boolean).join(" / ");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function paint(text: string, code: string, color: boolean): string {
  return color ? `\u001B[${code}m${text}\u001B[0m` : text;
}
