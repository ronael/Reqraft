/**
 * Global shortcut registration (DESKTOP.md §5.5, updated after the spike).
 *
 * `globalShortcut.register()` returns a boolean, never throws: a taken
 * shortcut fails silently — the worst possible failure mode for this product.
 * And the boolean can even lie: macOS intercepts some combos (⌘Space →
 * Spotlight) while `register()` still returns true. The answer is an ordered
 * candidate list, a visible result, and a usage confirmation in the settings
 * (lot 5).
 *
 * Electron-free: the register function is injected.
 */

import { t } from "./i18n.js";
import type { ShortcutIntent } from "@/apps/desktop/shared/ipc-contract.js";

export type { ShortcutIntent };

export interface ShortcutCandidate {
  /** Electron accelerator attempted for this intent. */
  accelerator: string;
  /**
   * What the shortcut opens: capture-first capsule, free-input capsule, or the
   * menu-bar popover.
   */
  intent: ShortcutIntent;
}

/**
 * Combinations no candidate list may contain, and why.
 *
 * Two different reasons, both fatal for a default:
 *
 * macOS claims the first group before any application sees the keystroke, and
 * `register()` still returns true — so the boolean is not evidence and the
 * shortcut is simply dead.
 *
 * The second group registers fine but is the published default of software
 * people run alongside this one: ⌥Espace belongs to ChatGPT, Alfred and
 * Raycast. Whichever application starts last loses, silently. A combination
 * whose owner depends on launch order is not a default.
 */
export const EXCLUDED_ACCELERATORS: readonly string[] = [
  // Claimed by macOS itself.
  "Command+Space",
  "Control+Space",
  "Command+Control+Space",
  "Command+Control+F",
  "Command+Control+Q",
  "Command+Control+D",
  // Claimed by the launchers people run alongside Reqraft.
  "Alt+Space",
  "Alt+Shift+Space",
];

/**
 * Ordered candidates, most to least desirable.
 *
 * ⌘⌃ is the family chosen deliberately. A global shortcut takes the keystroke
 * away from whatever has focus, so the question is not "is it free in macOS"
 * but "will a browser, an editor or an IDE want it". ⌘⌃ is the one two-modifier
 * family applications almost never bind: ⌘ and ⌘⇧ carry their menus, ⌃ and ⌃⌥
 * carry terminal and IDE bindings, and ⌥ is dead-key territory for text input.
 *
 * The previous defaults failed exactly there: ⌃⇧R is the browsers' hard reload
 * on Windows and Linux, and ⌃⌥R is bound in several IDE keymaps.
 *
 * The letters avoid what macOS already spends ⌘⌃ on — F, Q, D and Space, all
 * listed above.
 */
export const SHORTCUT_CANDIDATES: ShortcutCandidate[] = [
  { accelerator: "Command+Control+R", intent: "capture" },
  { accelerator: "Command+Control+N", intent: "input" },
  { accelerator: "Command+Control+O", intent: "popover" },
  { accelerator: "Command+Control+J", intent: "capture" },
  { accelerator: "Command+Control+K", intent: "input" },
  { accelerator: "Command+Control+T", intent: "popover" },
];

/**
 * Whether an accelerator may be offered or accepted at all.
 *
 * The check a user-chosen shortcut goes through before anything tries to
 * register it: a refusal here is explainable, whereas an excluded combination
 * that "registers" leaves the user pressing a key that does nothing.
 */
export function isUsableAccelerator(accelerator: string): boolean {
  const trimmed = accelerator.trim();
  if (trimmed === "") return false;
  if (EXCLUDED_ACCELERATORS.includes(trimmed)) return false;
  // A bare key with no modifier would swallow that key everywhere on the
  // system, which is never what someone means by a global shortcut.
  return trimmed.includes("+");
}

export type ShortcutRegistrar = (accelerator: string, handler: () => void) => boolean;

export interface ShortcutResolution {
  registered: { accelerator: string; label: string; intent: ShortcutIntent }[];
  /** Accelerators whose registration returned false — already taken. */
  rejected: string[];
  /**
   * Accelerators skipped because another intent of ours already holds them.
   *
   * Never handed to `register()`: one accelerator cannot reliably represent
   * two commands. The combination is dropped for this intent, the fallback
   * chain continues, and the collision is reported instead of being absorbed.
   */
  conflicts: string[];
}

/** Human-readable label with macOS symbols: `Control+Alt+R` → `⌃⌥R`. */
export function prettyAccelerator(accelerator: string): string {
  return accelerator
    .replace("CommandOrControl", "⌘")
    .replace("Command", "⌘")
    .replace("Control", "⌃")
    .replace("Alt", "⌥")
    .replace("Shift", "⇧")
    .replaceAll("+", "")
    .replace("Space", t("shortcut.space"));
}

/** The three intents, in the order they are served. */
export const SHORTCUT_INTENTS = ["capture", "input", "popover"] as const;

export interface ShortcutHandlers {
  onCapture: () => void;
  onInput: () => void;
  /** Opens or hides the menu-bar popover without touching the tray icon. */
  onPopover: () => void;
}

export type PreferredShortcuts = Partial<Record<ShortcutIntent, string>>;

/**
 * Registers one shortcut per intent (capture, free input, popover), walking the
 * candidate list in order.
 *
 * `forced` (env `REQRAFT_SHORTCUT` in dev) pins a single accelerator for the
 * capture intent: an explicit choice that fails must be visible, not silently
 * worked around. It leaves the other two intents unregistered, which is the
 * point — it is a development override for one combination, not a keymap.
 */
export function registerShortcuts(
  register: ShortcutRegistrar,
  handlers: ShortcutHandlers,
  forced?: string,
  preferred?: PreferredShortcuts,
): ShortcutResolution {
  const registered: ShortcutResolution["registered"] = [];
  const rejected: string[] = [];
  const conflicts: string[] = [];
  const intents = new Set<ShortcutIntent>(SHORTCUT_INTENTS);
  // What we already hold. Two intents may not depend on platform-specific
  // behaviour for a second registration of the same accelerator.
  const claimed = new Set<string>();
  // A preferred choice can also be the first built-in candidate. If it is
  // unavailable, retrying the exact same pair only duplicates the warning.
  const attempted = new Set<string>();

  // A configured choice is tried first, then the built-in chain takes over —
  // so a shortcut that stops working (a newly installed application took it)
  // degrades to a working one instead of to nothing.
  const chosen: ShortcutCandidate[] = [];
  for (const intent of SHORTCUT_INTENTS) {
    const accelerator = preferred?.[intent];
    if (accelerator !== undefined && isUsableAccelerator(accelerator)) {
      chosen.push({ accelerator, intent });
    }
  }

  const candidates = forced
    ? [{ accelerator: forced, intent: "capture" as const }]
    : [...chosen, ...SHORTCUT_CANDIDATES];

  for (const candidate of candidates) {
    const attempt = `${candidate.intent}:${candidate.accelerator}`;
    if (intents.has(candidate.intent) && !attempted.has(attempt)) {
      attempted.add(attempt);
      if (claimed.has(candidate.accelerator)) {
        conflicts.push(candidate.accelerator);
      } else if (register(candidate.accelerator, handlerFor(candidate.intent, handlers))) {
        registered.push({
          accelerator: candidate.accelerator,
          label: prettyAccelerator(candidate.accelerator),
          intent: candidate.intent,
        });
        claimed.add(candidate.accelerator);
        intents.delete(candidate.intent);
      } else {
        rejected.push(candidate.accelerator);
      }
    }
  }

  return { registered, rejected, conflicts };
}

function handlerFor(intent: ShortcutIntent, handlers: ShortcutHandlers): () => void {
  if (intent === "capture") return handlers.onCapture;
  if (intent === "input") return handlers.onInput;
  return handlers.onPopover;
}
