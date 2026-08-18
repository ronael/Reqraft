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
 * Ordered candidates, most to least desirable. ⌥Espace/⌥⇧Espace are the
 * product defaults but are commonly claimed by Alfred/Raycast — the boolean
 * tells us and we fall through. ⌘Espace (Spotlight) and ⌃Espace (input
 * source) are deliberately excluded: macOS swallows them while `register()`
 * claims success.
 */
export const SHORTCUT_CANDIDATES: ShortcutCandidate[] = [
  { accelerator: "Alt+Space", intent: "capture" },
  { accelerator: "Alt+Shift+Space", intent: "input" },
  { accelerator: "Control+Alt+R", intent: "capture" },
  { accelerator: "Control+Shift+R", intent: "input" },
  { accelerator: "Control+Alt+Space", intent: "capture" },
  { accelerator: "Command+Alt+R", intent: "capture" },
  { accelerator: "Control+Alt+Command+R", intent: "input" },
];

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
): ShortcutResolution {
  const registered: ShortcutResolution["registered"] = [];
  const rejected: string[] = [];
  const intents = new Set<"capture" | "input">(["capture", "input"]);

  const candidates = forced
    ? [{ accelerator: forced, intent: "capture" as const }]
    : SHORTCUT_CANDIDATES;

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
