import { spawn } from "node:child_process";
import process from "node:process";

/**
 * Handing a profile file to the system, so it opens in whatever the user has
 * set for `.json`.
 *
 * Deliberately the platform's own opener rather than `$EDITOR`. Three reasons:
 * it is always present, so there is no detection to get wrong and no "no editor
 * found" case to explain; the user has already told their system which
 * application edits JSON, and that answer is better than any list this file
 * could keep; and `$EDITOR` is conventionally a *terminal* editor, which would
 * need the TUI to hand over the TTY and take it back — the same territory as
 * the renderer teardown that once left the CLI impossible to quit.
 *
 * The process is detached and unreferenced: the editor outlives this one, the
 * TUI keeps its terminal, and nothing waits for a window to close. Nothing can
 * therefore know when the user saves, which is why the caller reloads the
 * catalogue on its next action instead of pretending to watch the file.
 */

/** The command each platform uses to open a file with its default handler. */
export function systemOpenCommand(platform: string = process.platform): {
  command: string;
  args: readonly string[];
} {
  if (platform === "darwin") return { command: "open", args: [] };
  if (platform === "win32") {
    // `start` is a shell builtin, not an executable, and its first quoted
    // argument is taken as the window title — hence the empty one.
    return { command: "cmd", args: ["/c", "start", ""] };
  }
  return { command: "xdg-open", args: [] };
}

export interface OpenInEditorOptions {
  platform?: string;
  /** Injected by tests so nothing is really launched. */
  launch?: (command: string, args: readonly string[]) => void;
}

/** Opens `file` with the system's default application for its type. */
export function openInEditor(file: string, options: OpenInEditorOptions = {}): { command: string } {
  const { command, args } = systemOpenCommand(options.platform);
  (options.launch ?? launchDetached)(command, [...args, file]);
  return { command };
}

function launchDetached(command: string, args: readonly string[]): void {
  // Resolved from the PATH, as `auth/credentials.ts` already does for
  // `secret-tool`: these openers have no stable absolute path across platforms
  // and installs, and `rp` is itself resolved from this same PATH — an attacker
  // who controls it has already won. The command is one of three fixed
  // literals; only the file path varies, and it comes from a validated profile
  // id, never from a profile's contents.
  const child = spawn(command, [...args], { detached: true, stdio: "ignore" });
  // Unreferenced so an open editor never keeps this process alive.
  child.unref();
}
