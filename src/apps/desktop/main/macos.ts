import { execFile } from "node:child_process";
import type { DesktopNativeBridge } from "./native-bridge.js";

/**
 * AppleScript bridges — the macOS keyboard-injection channel.
 *
 * `osascript` plays the role DESKTOP.md §5.3 reserves for a native module:
 * same Accessibility permission, nothing to compile. Proven by the spike; the
 * native module question only comes back with the Linux port.
 *
 * The runner is injected so the whole module is testable without macOS.
 */

export type OsascriptRunner = (script: string, timeoutMs?: number) => Promise<string>;

export function createOsascriptRunner(exec: typeof execFile = execFile): OsascriptRunner {
  return (script, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
      exec("osascript", ["-e", script], { timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      });
    });
}

export function createMacosBridge(
  run: OsascriptRunner,
  wait: (ms: number) => Promise<void> = delay,
): DesktopNativeBridge {
  async function frontmostApp(): Promise<string> {
    return await run(
      'tell application "System Events" to get name of first application process whose frontmost is true',
    );
  }

  async function activateApp(name: string, timeoutMs = 1500): Promise<boolean> {
    await run(`tell application "System Events" to set frontmost of process "${name}" to true`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await frontmostApp()) === name) {
        return true;
      }
      await wait(20);
    }
    return false;
  }

  async function sendKeystroke(letter: "c" | "v"): Promise<void> {
    await run(`tell application "System Events" to keystroke "${letter}" using command down`);
  }

  async function hasAutomation(): Promise<boolean> {
    try {
      await run('tell application "System Events" to get name of first application process');
      return true;
    } catch {
      return false;
    }
  }

  return { frontmostApp, activateApp, sendKeystroke, hasAutomation };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
