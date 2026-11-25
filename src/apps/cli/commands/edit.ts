import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { normalizeReqraftError, ReqraftError } from "@/core/errors.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";
import { detectColor } from "@/shared/terminal/capabilities.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { requestAppReview, type AppReview } from "@/agents/review-client.js";
import type { UiLocale } from "@/i18n/locale.js";
import { toAgentDraftArguments } from "@/apps/cli/opentui/agent-draft-arguments.js";
import { canRunOpenTui, runOpenTuiAppLauncher } from "@/apps/cli/opentui/launcher.js";
import { readKey, type Key } from "./keys.js";
import { runReprompt, type RepromptCliOptions } from "./reprompt.js";

/**
 * `rp edit <file>`: the editor Codex and Claude Code open with Ctrl+G.
 *
 * The agent writes its draft to a file, runs `$VISUAL` on it and takes the
 * file back once the editor exits. Reqraft rewrites the draft and writes the
 * result only when the user keeps it: in the desktop app's capsule when it is
 * open, otherwise in the full `rp` interface, and in a short before/after
 * review when that interface cannot start. Cancelling, or a failed rewrite,
 * leaves the file untouched and still exits 0: the agent then gives the draft
 * back as it was, without an error line.
 */
export type EditCommandOptions = Pick<RepromptCliOptions, "profile" | "level"> & {
  /** Replace without the before/after review. */
  yes?: boolean;
};

export interface EditDependencies {
  readText(file: string): Promise<string>;
  writeText(file: string, text: string): Promise<void>;
  /** Rewrites `text`; `code` is the CLI exit code, `text` the rewritten prompt. */
  rewrite(text: string, options: EditCommandOptions): Promise<{ code: number; text: string }>;
  /** Where the screens go: the terminal the agent handed over. */
  screen: { write(text: string): void };
  interactive: boolean;
  color: boolean;
  readKey(): Promise<Key>;
  /** Opens `file` in the user's own editor and returns its exit code. */
  openInEditor(file: string): number;
  /**
   * Hands the draft to the desktop app when it is open; `unavailable` (or
   * `busy`) means the review happens here, in the terminal.
   */
  reviewInApp(draft: string, onConnected: () => void): Promise<AppReview>;
  /**
   * Opens the full `rp` interface on the draft; it writes the file itself
   * when the user sends a result back. Null when it cannot start here (no
   * Bun, or no build): the short review takes over.
   */
  reviewInInterface(file: string, options: EditCommandOptions): number | null;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

/**
 * Text for a terminal the agent may have left in raw mode, where a line feed
 * goes down without coming back to the start of the line: every line break
 * becomes CR LF, so the review does not fall down the screen like a staircase.
 * Harmless in a normal terminal.
 */
export function forTerminal(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

/**
 * Agents hand Reqraft their draft as a Markdown or plain-text file (Gemini CLI
 * writes `buffer.txt`). The wrapper line gives the editor variable to the
 * agent, so the commands the agent runs inherit it: a `git commit` without
 * `-m` would open its message here. Anything else, and anything inside a
 * `.git` directory, goes to the user's own editor, untouched.
 */
export function isAgentDraft(file: string): boolean {
  return /\.(md|txt)$/i.test(file) && !/(^|[\\/])\.git([\\/]|$)/.test(file);
}

/** The editor to hand a non-draft file to: `EDITOR`, unless it is Reqraft itself. */
export function fallbackEditor(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const configured = env.EDITOR?.trim();
  if (configured !== undefined && configured !== "" && !/\brp\s+edit\b/.test(configured)) {
    return configured;
  }
  return platform === "win32" ? "notepad" : "vi";
}

export function defaultEditDependencies(t: Translator, uiLocale?: UiLocale): EditDependencies {
  return {
    readText: async (file) => {
      try {
        return await readFile(file, "utf8");
      } catch (error) {
        throw new ReqraftError("input.file_unreadable", EXIT_CODES.INVALID_INPUT, {
          params: { path: file },
          cause: error,
        });
      }
    },
    writeText: (file, text) => writeFile(file, text, "utf8"),
    rewrite: async (text, options) => {
      const captured: string[] = [];
      const code = await runReprompt(
        {
          text,
          profile: options.profile,
          level: options.level,
          stream: false,
          skipAgentsTip: true,
        },
        {
          log: (message) => captured.push(message),
          error: (message) => {
            process.stderr.write(forTerminal(`${message}\n`));
          },
        },
        t,
      );
      return { code, text: captured.join("\n") };
    },
    screen: {
      write: (text) => {
        process.stderr.write(process.stderr.isTTY ? forTerminal(text) : text);
      },
    },
    interactive: process.stdin.isTTY && process.stderr.isTTY,
    color: detectColor(process.env, process.stderr.isTTY),
    readKey: () => readKey(process.stdin),
    reviewInApp: (draft, onConnected) => requestAppReview(draft, { onConnected }),
    reviewInInterface: (file, options) => {
      if (!canRunOpenTui()) return null;
      try {
        return runOpenTuiAppLauncher(
          uiLocale,
          toAgentDraftArguments({ file, profile: options.profile, level: options.level }),
        );
      } catch {
        return null;
      }
    },
    openInEditor: (file) => {
      // The editor may carry arguments ("code --wait"); no shell is involved,
      // so nothing in the file name can run as a command.
      const [program = "vi", ...args] = fallbackEditor(process.env, process.platform).split(/\s+/);
      const result = spawnSync(program, [...args, file], { stdio: "inherit" });
      return result.status ?? EXIT_CODES.GENERAL_ERROR;
    },
  };
}

export async function runEdit(
  file: string,
  options: EditCommandOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
  deps: EditDependencies = defaultEditDependencies(t),
): Promise<number> {
  const { screen } = deps;
  const style: Style = (text, code) => (deps.color ? `\u001B[${code}m${text}\u001B[0m` : text);

  if (!isAgentDraft(file)) return deps.openInEditor(file);

  let draft: string;
  try {
    draft = await deps.readText(file);
  } catch (error) {
    screen.write(`${t("common.error")} : ${formatUiError(error, "edit", t)}\n`);
    return normalizeReqraftError(error).exitCode;
  }

  // Back to the agent with the draft as it was, once the user has read why.
  const giveBack = async (message: string): Promise<number> => {
    screen.write(`${message}\n`);
    if (!deps.interactive) return EXIT_CODES.GENERAL_ERROR;
    screen.write(`${style(t("edit.failedReturn"), "2")}\n`);
    await deps.readKey();
    return EXIT_CODES.SUCCESS;
  };

  if (draft.trim() === "") return giveBack(t("edit.empty"));

  const answeredInApp = await reviewInAppFirst(file, draft, options, deps, style, t);
  if (answeredInApp !== null) return answeredInApp;
  const answeredInInterface = await reviewInInterfaceNext(file, draft, options, deps);
  if (answeredInInterface !== null) return answeredInInterface;

  for (;;) {
    const attempt = await rewriteOnce(draft, options, deps, style, t);
    if (attempt.kind === "done") return attempt.code;
    if (!deps.interactive || options.yes === true) {
      await deps.writeText(file, attempt.text);
      return EXIT_CODES.SUCCESS;
    }
    showReview(draft, attempt.text, deps, style, t);
    const decision = await waitForDecision(deps);
    if (decision === "keep") {
      await deps.writeText(file, attempt.text);
      return EXIT_CODES.SUCCESS;
    }
    if (decision === "cancel") return EXIT_CODES.SUCCESS;
  }
}

type Style = (text: string, code: string) => string;

/**
 * With the app open, the capsule reviews the draft; the terminal is the
 * fallback, and the only place without a person at the keyboard. Null means
 * the review happens here.
 */
async function reviewInAppFirst(
  file: string,
  draft: string,
  options: EditCommandOptions,
  deps: EditDependencies,
  style: Style,
  t: Translator,
): Promise<number | null> {
  if (!deps.interactive || options.yes === true) return null;
  const inApp = await deps.reviewInApp(draft, () => {
    deps.screen.write(`${style(t("edit.inApp"), "2")}\n`);
  });
  if (inApp.result === "kept") {
    await deps.writeText(file, inApp.text);
    return EXIT_CODES.SUCCESS;
  }
  return inApp.result === "cancelled" ? EXIT_CODES.SUCCESS : null;
}

/**
 * Without the app, the full `rp` interface: profile, level and model, the
 * diff, and a draft to touch up before rewriting it again. Null means the
 * short review: no interface here, or one that failed before sending anything
 * back.
 */
async function reviewInInterfaceNext(
  file: string,
  draft: string,
  options: EditCommandOptions,
  deps: EditDependencies,
): Promise<number | null> {
  if (!deps.interactive || options.yes === true) return null;
  const code = deps.reviewInInterface(file, options);
  if (code === null) return null;
  if (code === EXIT_CODES.SUCCESS) return EXIT_CODES.SUCCESS;
  const now = await deps.readText(file).catch(() => draft);
  return now === draft ? null : EXIT_CODES.SUCCESS;
}

/** One rewrite: its text, or the exit code to leave with when it failed. */
async function rewriteOnce(
  draft: string,
  options: EditCommandOptions,
  deps: EditDependencies,
  style: Style,
  t: Translator,
): Promise<{ kind: "text"; text: string } | { kind: "done"; code: number }> {
  if (deps.interactive) deps.screen.write("\u001B[2J\u001B[H");
  deps.screen.write(`${style(t("edit.rewriting"), "2")}\n`);
  const { code, text } = await deps.rewrite(draft, options);
  if (code === EXIT_CODES.SUCCESS && text.trim() !== "") return { kind: "text", text };
  if (!deps.interactive) {
    return { kind: "done", code: code === EXIT_CODES.SUCCESS ? EXIT_CODES.GENERAL_ERROR : code };
  }
  // The reason is on screen: leave it there until the user is done reading.
  deps.screen.write(`${style(t("edit.failedReturn"), "2")}\n`);
  await deps.readKey();
  return { kind: "done", code: EXIT_CODES.SUCCESS };
}

function showReview(
  draft: string,
  text: string,
  deps: EditDependencies,
  style: Style,
  t: Translator,
): void {
  const { screen } = deps;
  screen.write("\u001B[2J\u001B[H");
  screen.write(`${style("rq", "1;35")}  ${style("rp edit", "2")}\n\n`);
  screen.write(`${style(t("edit.before").toUpperCase(), "2")}\n${style(draft.trimEnd(), "2")}\n\n`);
  screen.write(`${style(t("edit.after").toUpperCase(), "2")}\n${style(text.trimEnd(), "1")}\n\n`);
  screen.write(
    [
      `${style("⏎", "1")} ${t("edit.keep")}`,
      `${style("r", "1")} ${t("edit.retry")}`,
      `${style("esc", "1")} ${t("edit.cancel")}`,
    ].join("    ") + "\n",
  );
}

async function waitForDecision(deps: EditDependencies): Promise<"keep" | "retry" | "cancel"> {
  for (;;) {
    const key = await deps.readKey();
    if (key === "enter") return "keep";
    if (key === "escape" || key === "interrupt") return "cancel";
    if (typeof key === "object" && key.char === "r") return "retry";
    if (typeof key === "object" && key.char === "q") return "cancel";
  }
}
