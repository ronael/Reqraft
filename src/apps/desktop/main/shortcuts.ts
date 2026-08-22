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

export interface ShortcutCandidate {
  /** Accelerator tried first: ⌥Espace, the product default (§3). */
  accelerator: string;
  /** What the shortcut opens: capture-first capsule, or free-input capsule. */
  intent: "capture" | "input";
}

/**
 * Combinations no candidate list may contain.
 *
 * `register()` returns true for these and the keystroke never arrives: macOS
 * claims them before any application sees them, so a boolean is not evidence.
 * ⌥Espace and ⌥⇧Espace are here for a different reason — they register fine,
 * but they are the default of ChatGPT, Alfred and Raycast, so whichever
 * application starts last silently loses the shortcut. A combination that
 * depends on launch order is not a default.
 */
export const EXCLUDED_ACCELERATORS: readonly string[] = [
  "Command+Space",
  "Control+Space",
  "Alt+Space",
  "Alt+Shift+Space",
];

/**
 * Ordered candidates, most to least desirable.
 *
 * ⌃⌥R and ⌃⇧R lead: two modifiers and a letter, which no common macOS
 * launcher claims, and `R` for Reqraft. The rest are fallbacks walked only
 * when `register()` reports a combination as taken.
 */
export const SHORTCUT_CANDIDATES: ShortcutCandidate[] = [
  { accelerator: "Control+Alt+R", intent: "capture" },
  { accelerator: "Control+Shift+R", intent: "input" },
  { accelerator: "Control+Alt+Command+R", intent: "capture" },
  { accelerator: "Control+Alt+Shift+R", intent: "input" },
  { accelerator: "Command+Alt+R", intent: "capture" },
  { accelerator: "Command+Alt+Shift+R", intent: "input" },
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
  registered: { accelerator: string; label: string; intent: "capture" | "input" }[];
  /** Accelerators whose registration returned false — already taken. */
  rejected: string[];
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
    .replace("Space", "Espace");
}

/**
 * Registers one shortcut per intent (capture, free input), walking the
 * candidate list in order.
 *
 * `forced` (env `REQRAFT_SHORTCUT` in dev) pins a single accelerator for the
 * capture intent: an explicit choice that fails must be visible, not silently
 * worked around.
 */
export function registerShortcuts(
  register: ShortcutRegistrar,
  handlers: { onCapture: () => void; onInput: () => void },
  forced?: string,
  preferred?: { capture?: string; input?: string },
): ShortcutResolution {
  const registered: ShortcutResolution["registered"] = [];
  const rejected: string[] = [];
  const intents = new Set<"capture" | "input">(["capture", "input"]);

  // A configured choice is tried first, then the built-in chain takes over —
  // so a shortcut that stops working (a newly installed application took it)
  // degrades to a working one instead of to nothing.
  const chosen: ShortcutCandidate[] = [];
  if (preferred?.capture !== undefined && isUsableAccelerator(preferred.capture)) {
    chosen.push({ accelerator: preferred.capture, intent: "capture" });
  }
  if (preferred?.input !== undefined && isUsableAccelerator(preferred.input)) {
    chosen.push({ accelerator: preferred.input, intent: "input" });
  }

  const candidates = forced
    ? [{ accelerator: forced, intent: "capture" as const }]
    : [...chosen, ...SHORTCUT_CANDIDATES];

  for (const candidate of candidates) {
    if (!intents.has(candidate.intent)) {
      continue;
    }
    const handler = candidate.intent === "capture" ? handlers.onCapture : handlers.onInput;
    if (register(candidate.accelerator, handler)) {
      registered.push({
        accelerator: candidate.accelerator,
        label: prettyAccelerator(candidate.accelerator),
        intent: candidate.intent,
      });
      intents.delete(candidate.intent);
    } else {
      rejected.push(candidate.accelerator);
    }
  }

  return { registered, rejected };
}
