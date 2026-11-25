import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nodeAgentsPorts } from "@/agents/node-ports.js";
import { UNSUPPORTED_REASON_KEYS } from "@/agents/catalog.js";
import {
  otherSupportedAgents,
  readAgentsStatus,
  setAgentsEnabled,
  type AgentsStatus,
} from "@/agents/setup.js";
import { displayPath, shellLabel, wrapperLine, type ShellEnvironment } from "@/agents/shell.js";
import {
  AgentCopyRequestSchema,
  AgentReviewInAppRequestSchema,
  AgentSetRequestSchema,
  AnnouncementDismissRequestSchema,
  EmptyRequestSchema,
  type AgentCopyRequest,
  type AnnouncementId,
  type DesktopAgentsState,
} from "@/apps/desktop/shared/ipc-contract.js";
import { ConfigSchema, type Config } from "@/config/schema.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type { IpcMainLike } from "./ipc.js";
import { ReqraftError } from "@/core/errors.js";
import type { UiLocale } from "@/i18n/locale.js";
import { createTranslator } from "@/i18n/translate.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

/**
 * Réglages › Agents IA, côté processus principal.
 *
 * Le module partagé `@/agents` fait le travail ; ce fichier lui donne ce qu'une
 * application de bureau a de particulier. Ouverte depuis le Finder, elle n'a
 * pas le PATH du terminal : `rp`, `codex` ou `claude` y seraient introuvables.
 * Le PATH vient donc du shell de connexion de l'utilisateur, demandé une fois.
 */

const run = promisify(execFile);

export const CLI_INSTALL_COMMAND = "npm install -g @reqraft/cli";

export interface DesktopAgentsDependencies {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  home: string | undefined;
  locale(): UiLocale;
  writeClipboard(text: string): void;
  /** The PATH a terminal would have. */
  searchPath(): Promise<string | undefined>;
  /** The version `rp --version` prints, or null when it cannot say. */
  cliVersion(rpPath: string, searchPath: string | undefined): Promise<string | null>;
  /** Whether drafts are reviewed in the capsule while the app is open. */
  reviewInApp(): Promise<boolean>;
  setReviewInApp(enabled: boolean): Promise<void>;
}

export interface DesktopAgents {
  state(): Promise<DesktopAgentsState>;
  setEnabled(id: string, enabled: boolean): Promise<DesktopAgentsState>;
  copy(request: AgentCopyRequest): Promise<void>;
  setReviewInApp(enabled: boolean): Promise<DesktopAgentsState>;
}

export function createDesktopAgents(deps: DesktopAgentsDependencies): DesktopAgents {
  const environment: ShellEnvironment = { env: deps.env, platform: deps.platform, home: deps.home };

  async function context() {
    const searchPath = await deps.searchPath();
    return { searchPath, ports: nodeAgentsPorts(searchPath, deps.platform, deps.env.PATHEXT) };
  }

  async function present(
    status: AgentsStatus,
    { searchPath, ports }: Awaited<ReturnType<typeof context>>,
  ): Promise<DesktopAgentsState> {
    const t = createTranslator(deps.locale());
    const rp = await ports.findExecutable("rp");
    return {
      cli:
        rp === null
          ? { installed: false, installCommand: CLI_INSTALL_COMMAND }
          : {
              installed: true,
              path: displayPath(rp, deps.home),
              version: await deps.cliVersion(rp, searchPath),
            },
      shell:
        status.shell === null
          ? null
          : { name: shellLabel(status.shell.kind), file: status.shell.displayFile },
      agentPrompt: t("agents.setupPrompt"),
      agents: status.agents.map(({ spec, path, enabled }) => ({
        id: spec.id,
        label: spec.label,
        command: spec.command,
        path: path === null ? null : displayPath(path, deps.home),
        enabled,
        supported: spec.support.kind === "editor",
        reason:
          spec.support.kind === "editor" ? null : t(UNSUPPORTED_REASON_KEYS[spec.support.reason]),
        featured: spec.featured === true,
        shortcut: spec.support.kind === "editor" ? spec.support.shortcut : null,
        line:
          spec.support.kind === "editor" && status.shell !== null
            ? wrapperLine(status.shell.kind, spec.command, spec.support.variable)
            : null,
      })),
      alsoSupported: otherSupportedAgents(status).map((spec) => spec.label),
      reviewInApp: await deps.reviewInApp(),
    };
  }

  return {
    async state() {
      const current = await context();
      return present(await readAgentsStatus(current.ports, environment), current);
    },
    async setEnabled(id, enabled) {
      const current = await context();
      return present(await setAgentsEnabled(current.ports, environment, [id], enabled), current);
    },
    async setReviewInApp(enabled) {
      await deps.setReviewInApp(enabled);
      return this.state();
    },
    async copy(request) {
      const text = textToCopy(request, await this.state());
      if (text === null) {
        throw new ReqraftError("agents.unknown", EXIT_CODES.INVALID_INPUT, {
          params: { agent: request.what === "line" ? request.id : request.what },
        });
      }
      deps.writeClipboard(text);
    },
  };
}

function textToCopy(request: AgentCopyRequest, state: DesktopAgentsState): string | null {
  if (request.what === "install") return CLI_INSTALL_COMMAND;
  if (request.what === "prompt") return state.agentPrompt;
  return state.agents.find((agent) => agent.id === request.id)?.line ?? null;
}

const PATH_MARKER = "__REQRAFT_PATH__";

/**
 * The PATH of the user's login shell, read once. Interactive and login, so
 * that `.zshrc` (nvm, Homebrew, ~/.local/bin) is read as in a terminal; the
 * markers keep whatever the start-up files print out of the answer. Falls back
 * to the app's own PATH plus the usual install directories.
 */
export async function loginShellPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  home: string | undefined,
): Promise<string | undefined> {
  if (platform === "win32") return env.PATH ?? env.Path;
  const shell = env.SHELL ?? "/bin/zsh";
  const script = shell.endsWith("fish")
    ? `printf '%s%s%s' ${PATH_MARKER} (string join : $PATH) ${PATH_MARKER}`
    : `printf '%s%s%s' ${PATH_MARKER} "$PATH" ${PATH_MARKER}`;
  try {
    const { stdout } = await run(shell, ["-ilc", script], {
      env: { ...env, DISABLE_AUTO_UPDATE: "true" },
      timeout: 5000,
    });
    const found = new RegExp(`${PATH_MARKER}(.*?)${PATH_MARKER}`, "s").exec(stdout)?.[1];
    if (found !== undefined && found !== "") return found;
  } catch {
    // A shell that fails to start or takes too long: fall back below.
  }
  const usual = ["/opt/homebrew/bin", "/usr/local/bin"];
  if (home !== undefined) usual.push(`${home}/.local/bin`);
  return [env.PATH, ...usual].filter(Boolean).join(":");
}

export async function cliVersion(
  rpPath: string,
  searchPath: string | undefined,
): Promise<string | null> {
  try {
    const { stdout } = await run(rpPath, ["--version"], {
      env: { ...process.env, PATH: searchPath ?? process.env.PATH },
      timeout: 5000,
    });
    const first = stdout.trim().split("\n")[0] ?? "";
    return first === "" ? null : first;
  } catch {
    return null;
  }
}

/** Announcements this version can make, newest first. */
export const ANNOUNCEMENTS: readonly AnnouncementId[] = ["agents"];

export function unseenAnnouncements(config: Config): AnnouncementId[] {
  const seen = new Set(config.desktopAnnouncementsSeen ?? []);
  return ANNOUNCEMENTS.filter((id) => !seen.has(id));
}

export function withAnnouncementSeen(config: Config, id: AnnouncementId): Config {
  const seen = new Set(config.desktopAnnouncementsSeen ?? []);
  seen.add(id);
  return { ...config, desktopAnnouncementsSeen: [...seen] };
}

/** Réglages › Agents IA and the one-time announcements, as IPC handlers. */
export function registerAgentsHandlers(
  ipcMain: IpcMainLike,
  agents: DesktopAgents | undefined,
  loadUser: () => Promise<Config>,
  save: (config: Config) => Promise<void>,
): void {
  const available = (): DesktopAgents => {
    if (agents === undefined) throw new Error("agents are not available");
    return agents;
  };
  ipcMain.handle(IPC_CHANNELS.agentsState, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return await available().state();
  });
  ipcMain.handle(IPC_CHANNELS.agentsSet, async (_event, payload) => {
    const { id, enabled } = AgentSetRequestSchema.parse(payload);
    return await available().setEnabled(id, enabled);
  });
  ipcMain.handle(IPC_CHANNELS.agentsCopy, async (_event, payload) => {
    await available().copy(AgentCopyRequestSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.agentsReviewInApp, async (_event, payload) => {
    const { enabled } = AgentReviewInAppRequestSchema.parse(payload);
    return await available().setReviewInApp(enabled);
  });
  ipcMain.handle(IPC_CHANNELS.announcementsRead, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return unseenAnnouncements(await loadUser());
  });
  ipcMain.handle(IPC_CHANNELS.announcementsDismiss, async (_event, payload) => {
    const { id } = AnnouncementDismissRequestSchema.parse(payload);
    await save(ConfigSchema.parse(withAnnouncementSeen(await loadUser(), id)));
  });
}
