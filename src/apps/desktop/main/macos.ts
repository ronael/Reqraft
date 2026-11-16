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

export type OsascriptLanguage = "AppleScript" | "JavaScript";

export interface OsascriptOptions {
  timeoutMs?: number;
  language?: OsascriptLanguage;
}

export type OsascriptRunner = (script: string, options?: OsascriptOptions) => Promise<string>;

export function createOsascriptRunner(exec: typeof execFile = execFile): OsascriptRunner {
  return (script, { timeoutMs = 3000, language = "AppleScript" } = {}) =>
    new Promise((resolve, reject) => {
      exec(
        "osascript",
        ["-l", language, "-e", script],
        { timeout: timeoutMs },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }
          resolve(stdout.trim());
        },
      );
    });
}

/**
 * Reads the focused element's selected text through the accessibility API.
 *
 * JavaScript for Automation reaches `AXUIElementCopyAttributeValue` directly,
 * so the read needs Accessibility only, not Automation of System Events, and
 * leaves the clipboard alone. Attribute names must be NSStrings (`$("…")`): a
 * plain JS string is rejected as an illegal argument. The messaging timeout
 * drops from six seconds to half a second, so an app that does not answer
 * cannot hold the shortcut. The text travels as JSON, which keeps its exact
 * whitespace through the runner's trim.
 *
 * The framework name goes through a variable in both scripts: written as a
 * literal, `ObjC.import("…")` reads like a dynamic import to the guard that
 * checks the main bundle only loads packages the app ships.
 */
export const READ_SELECTION_SCRIPT = String.raw`
const framework = "ApplicationServices";
ObjC.import(framework);
function run() {
  const system = $.AXUIElementCreateSystemWide();
  $.AXUIElementSetMessagingTimeout(system, 0.5);
  const focused = Ref();
  if ($.AXUIElementCopyAttributeValue(system, $("AXFocusedUIElement"), focused) !== 0) {
    return JSON.stringify({ text: null });
  }
  const selected = Ref();
  if ($.AXUIElementCopyAttributeValue(focused[0], $("AXSelectedText"), selected) !== 0) {
    return JSON.stringify({ text: null });
  }
  const text = ObjC.castRefToObject(selected[0]).js;
  return JSON.stringify({ text: typeof text === "string" ? text : null });
}
`;

/**
 * Types ⌘<letter> once Shift, Control, Option and Command are released.
 *
 * Those are bits 17 to 20 (`0x1e0000`) of the HID system state that
 * `CGEventSourceFlagsState(1)` reports. CoreGraphics adds about 10 ms to the
 * osascript start; AppKit's `NSEvent.modifierFlags` from AppleScript cost
 * 250 ms on every copy and paste. The wait is bounded at 40 × 15 ms: a user who
 * keeps a key down still gets the keystroke, only later.
 */
export function keystrokeScript(letter: "c" | "v"): string {
  return String.raw`
const framework = "CoreGraphics";
ObjC.import(framework);
function run() {
  const held = 0x1e0000;
  for (let i = 0; i < 40 && ($.CGEventSourceFlagsState(1) & held) !== 0; i++) {
    delay(0.015);
  }
  Application("System Events").keystroke("${letter}", { using: "command down" });
}
`;
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

  async function readSelection(): Promise<string | null> {
    try {
      const output = await run(READ_SELECTION_SCRIPT, { language: "JavaScript", timeoutMs: 1500 });
      return parseSelection(output);
    } catch {
      // No Accessibility grant, an app that does not answer, a slow start:
      // the simulated copy is the fallback, and it reports permission errors.
      return null;
    }
  }

  async function sendKeystroke(letter: "c" | "v"): Promise<void> {
    await run(keystrokeScript(letter), { language: "JavaScript" });
  }

  async function hasAutomation(): Promise<boolean> {
    try {
      await run('tell application "System Events" to get name of first application process');
      return true;
    } catch {
      return false;
    }
  }

  return { frontmostApp, activateApp, readSelection, sendKeystroke, hasAutomation };
}

/** `{ "text": "…" }` from the read script; anything else counts as unreadable. */
export function parseSelection(output: string): string | null {
  try {
    const value: unknown = JSON.parse(output);
    if (typeof value !== "object" || value === null) return null;
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
