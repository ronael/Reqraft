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
  sendKeystroke: (letter: "c" | "v") => Promise<void>;
  /** macOS Automation probe; other adapters return true. */
  hasAutomation: () => Promise<boolean>;
}
