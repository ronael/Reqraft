import type { DesktopNativeBridge } from "./native-bridge.js";
import { t } from "./i18n.js";

/**
 * Selection capture and reinjection — the product's critical path
 * (DESKTOP.md §5.1 and §5.2), ported from the spike.
 *
 * The selection is first read through the accessibility API, which leaves the
 * clipboard alone. Only when the application does not expose it (Chromium and
 * Electron apps, terminals) does the capture simulate a copy, and that path
 * has three silent-failure traps, each handled explicitly:
 *  1. the copy is asynchronous — reading immediately returns the old content ;
 *  2. without a sentinel, "no selection" and "selection identical to the
 *     clipboard" are indistinguishable ;
 *  3. the user's clipboard must be handed back intact, even on error.
 *
 * Electron-free: the clipboard and the keystroke channel are injected.
 */

/**
 * NUL-bracketed so it can never collide with real user text. Written with
 * escapes to keep this file plain UTF-8 text.
 */
const SENTINEL = "\u0000reqraft-desktop-sentinel\u0000";
/**
 * Long enough for Electron apps such as VS Code or Slack, which answer ⌘C in
 * 100 to 400 ms. At 300 ms a slow copy landed after the restore and replaced
 * the user's clipboard with the selection, while the capsule said "no
 * selection".
 */
const COPY_TIMEOUT_MS = 600;
const POLL_INTERVAL_MS = 10;
/**
 * Battement entre l'activation confirmée et la frappe.
 *
 * `activateApp` confirme que le *processus* est au premier plan. Sa fenêtre
 * n'accepte pas les frappes pour autant : ⌘V envoyé dans la foulée atterrit
 * dans la fenêtre précédente — la capsule — qui n'a aucun champ à ce
 * moment-là. La sélection reste alors intacte et le remplacement se déclare
 * quand même réussi. C'est la seconde moitié du constat du spike (§5.2), dont
 * seule la confirmation avait été implémentée.
 */
const ACTIVATE_SETTLE_MS = 120;

/**
 * Temps laissé à l'application cible pour consommer le collage.
 *
 * La frappe est asynchrone : `osascript` rend la main quand l'événement est
 * posté, pas quand l'application l'a traité. Restaurer le presse-papiers trop
 * tôt fait coller à l'application l'ancien contenu — la sélection n'est pas
 * remplacée, et rien ne le signale. 150 ms suffisaient à un éditeur de texte,
 * pas à une application lourde.
 */
const PASTE_SETTLE_MS = 400;

/** What the clipboard held before Reqraft wrote to it. */
export interface ClipboardSnapshot {
  /** The plain-text part, `""` when there is none. */
  readonly text: string;
  /** Puts every saved format back: text, but also rich text, HTML, image. */
  restore: () => void;
}

export interface CaptureClipboard {
  readText: () => string;
  writeText: (text: string) => void;
  availableFormats: () => string[];
  snapshot: () => ClipboardSnapshot;
}

export interface CaptureDependencies {
  clipboard: CaptureClipboard;
  /** Absent, the capture goes straight to the simulated copy. */
  readSelection?: DesktopNativeBridge["readSelection"];
  sendKeystroke: DesktopNativeBridge["sendKeystroke"];
  activateApp: DesktopNativeBridge["activateApp"];
  wait?: (ms: number) => Promise<void>;
  copyTimeoutMs?: number;
  pollIntervalMs?: number;
  pasteSettleMs?: number;
  activateSettleMs?: number;
}

/**
 * `clipboardText` is what the user had copied when nothing could be captured:
 * the capsule offers it instead of an empty field. It never leaves the
 * machine unless the user then asks for a rewrite.
 */
export type CaptureOutcome =
  { text: string } | { empty: true; reason: string; clipboardText?: string };

export interface ReplaceOutcome {
  applied: boolean;
  reason?: string;
}

/**
 * Reads the selection of the frontmost application. `{ empty: true }` is a
 * normal outcome: the capsule then opens in free-input mode.
 */
export async function captureSelection(deps: CaptureDependencies): Promise<CaptureOutcome> {
  const direct = await readDirectly(deps.readSelection);
  if (direct !== null) {
    return { text: direct };
  }
  return await captureByCopy(deps);
}

/**
 * The accessibility read. An empty answer is not taken as "no selection":
 * some apps report an empty selected text while text is selected, so the
 * copy decides. A failure only means the copy has to be tried.
 */
async function readDirectly(read: CaptureDependencies["readSelection"]): Promise<string | null> {
  if (read === undefined) return null;
  try {
    const text = await read();
    return text !== null && text.trim() !== "" ? text : null;
  } catch {
    return null;
  }
}

async function captureByCopy(deps: CaptureDependencies): Promise<CaptureOutcome> {
  const { clipboard } = deps;
  const wait = deps.wait ?? defaultWait;
  const copyTimeoutMs = deps.copyTimeoutMs ?? COPY_TIMEOUT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;

  // A clipboard without text (an image, files) would not survive the round
  // trip: do not touch it, open the capsule centred in free-input mode
  // instead (§5.1).
  if (clipboard.readText() === "" && clipboard.availableFormats().length > 0) {
    return { empty: true, reason: t("main.captureClipboardNotText") };
  }

  const saved = clipboard.snapshot();
  try {
    clipboard.writeText(SENTINEL);
    await deps.sendKeystroke("c");

    const captured = await waitForClipboardChange(clipboard, wait, copyTimeoutMs, pollIntervalMs);
    if (captured === null) {
      return { empty: true, reason: t("main.captureNoSelection"), ...suggestion(saved.text) };
    }
    return { text: captured };
  } catch (error) {
    // A capture that cannot run is, from the capsule's point of view, the same
    // as no selection: it opens in free-input mode. Letting this reject instead
    // left an unhandled rejection on the console and no capsule at all — the
    // shortcut simply did nothing, which is the failure §5.9 exists to avoid.
    return {
      empty: true,
      reason: describeNativeFailure(error, (detail) => t("main.captureFailed", { detail })),
      ...suggestion(saved.text),
    };
  } finally {
    // Systematic restoration, including when the capture failed.
    saved.restore();
  }
}

/** Only real text is worth offering: a blank clipboard offers nothing. */
function suggestion(text: string): { clipboardText?: string } {
  return text.trim() === "" ? {} : { clipboardText: text };
}

/**
 * Why a native call could not run, in words the user can act on.
 *
 * macOS reports a missing Accessibility grant as osascript error 1002, whose
 * own wording names `osascript` — a program the user never launched. The
 * substitution says what to do instead of what failed.
 */
export function describeNativeFailure(
  error: unknown,
  otherwise: (detail: string) => string,
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("1002") || message.includes("not allowed to send keystrokes")) {
    return t("main.captureAccessibilityDenied");
  }
  // -1743 : « Not authorized to send Apple events to System Events ». C'est
  // l'Automatisation, pas l'Accessibilité — deux réglages différents, dans deux
  // panneaux différents, et envoyer quelqu'un dans le mauvais ne mène nulle part.
  if (message.includes("1743") || message.includes("Apple event")) {
    return t("main.captureAutomationDenied");
  }
  return otherwise(message);
}

/**
 * Reinjects the text into the source application. Order matters: write,
 * reactivate, CONFIRM the switch, and only then paste (§5.2). When the source
 * app is unreachable the text stays in the clipboard so the user can paste it
 * themselves.
 */
export async function replaceSelection(
  text: string,
  sourceApp: string,
  deps: CaptureDependencies,
): Promise<ReplaceOutcome> {
  const { clipboard } = deps;
  const wait = deps.wait ?? defaultWait;
  const pasteSettleMs = deps.pasteSettleMs ?? PASTE_SETTLE_MS;
  const activateSettleMs = deps.activateSettleMs ?? ACTIVATE_SETTLE_MS;
  const saved = clipboard.snapshot();

  clipboard.writeText(text);

  const restored = await deps.activateApp(sourceApp);
  if (!restored) {
    return { applied: false, reason: t("main.replaceSourceInactive") };
  }

  // Laisser la fenêtre devenir vraiment active avant de frapper.
  await wait(activateSettleMs);
  await deps.sendKeystroke("v");
  await wait(pasteSettleMs);

  // Ne rendre le presse-papiers que s'il porte encore notre texte : entre-temps
  // l'utilisateur a pu copier autre chose, et le lui écraser serait pire que de
  // laisser le résultat en place.
  if (clipboard.readText() === text) {
    saved.restore();
  }

  return { applied: true };
}

async function waitForClipboardChange(
  clipboard: CaptureClipboard,
  wait: (ms: number) => Promise<void>,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = clipboard.readText();
    if (current !== SENTINEL && current !== "") {
      return current;
    }
    await wait(pollIntervalMs);
  }
  return null;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exposed for tests only: the exact sentinel planted in the clipboard. */
export const CAPTURE_SENTINEL_FOR_TESTS = SENTINEL;
