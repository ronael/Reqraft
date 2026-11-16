/**
 * Native bridge used by the desktop capture flow.
 *
 * The contract deliberately stays platform-neutral: CaptureService knows how
 * to orchestrate copy, focus restoration and paste, while each adapter owns
 * the operating-system APIs required to perform those actions.
 */
export interface DesktopNativeBridge {
  /** User-facing name of the process that currently owns the foreground window. */
  frontmostApp: () => Promise<string>;
  /** Brings the exact process remembered for `name` back to the foreground. */
  activateApp: (name: string, timeoutMs?: number) => Promise<boolean>;
  /**
   * The focused element's selected text, read through the accessibility API
   * without touching the clipboard. `null` when the application does not
   * expose it — Chromium and Electron apps, terminals, Java — or when the
   * read fails: the caller then falls back to a simulated copy.
   */
  readSelection: () => Promise<string | null>;
  /**
   * Types ⌘C / ⌘V (Ctrl on Windows), never while the shortcut's modifier keys
   * are still down. Typed then, ⌘C arrives as ⌘⌃C, which most apps ignore, and
   * Ctrl+C as Ctrl+Alt+C, which types a character on many keyboard layouts.
   * macOS waits here; Windows waits in `frontmostApp`, which the capture always
   * runs first.
   */
  sendKeystroke: (letter: "c" | "v") => Promise<void>;
  /** macOS Automation probe; other adapters return true. */
  hasAutomation: () => Promise<boolean>;
}
