import process from "node:process";

export interface TerminalCapabilities {
  /** Colour may be emitted at all. */
  color: boolean;
  /** Box-drawing characters and symbols render reliably. */
  unicode: boolean;
}

const UTF8_LOCALE = /utf-?8/i;

/**
 * Whether the terminal can be trusted with box-drawing characters.
 *
 * A UTF-8 locale is the primary signal. Windows is treated as unreliable
 * unless it announces Windows Terminal or a known host, because the legacy
 * console still renders box drawing as mojibake in several code pages.
 */
export function detectUnicode(env: NodeJS.ProcessEnv, platform: string): boolean {
  const locale = env.LC_ALL ?? env.LC_CTYPE ?? env.LANG ?? "";
  if (platform === "win32") {
    return Boolean(env.WT_SESSION ?? env.TERM_PROGRAM);
  }
  if (env.TERM === "dumb") {
    return false;
  }
  return UTF8_LOCALE.test(locale);
}

/**
 * Whether colour should be emitted.
 *
 * Honours the NO_COLOR convention and refuses to colour a non-TTY, so pipes
 * and captured output stay clean (DA.md section 2).
 */
/**
 * `isTty` defaults to false because Node leaves `process.stdout.isTTY`
 * undefined off a TTY, even though @types/node declares it a boolean.
 */
export function detectColor(env: NodeJS.ProcessEnv, isTty = false): boolean {
  if (env.NO_COLOR !== undefined) {
    return false;
  }
  if (env.TERM === "dumb") {
    return false;
  }
  return isTty;
}

export function detectCapabilities(
  env: NodeJS.ProcessEnv,
  isTty = false,
  platform: string = process.platform,
): TerminalCapabilities {
  return {
    color: detectColor(env, isTty),
    unicode: detectUnicode(env, platform),
  };
}
