/**
 * How long a toast stays on screen.
 *
 * A fixed delay cannot serve both "✓ Copié" and a message carrying a file path:
 * the first is read at a glance, the second has to be read. At 1.5 s the long
 * ones were gone before they could be finished.
 *
 * The rule is therefore reading time — a floor that covers noticing the toast
 * at all, plus time per character, capped so a toast never lingers over the
 * interface it covers.
 */

/** Enough to notice a toast appeared and read a couple of words. */
export const TOAST_MINIMUM_MS = 2_500;

/** Above this, a message is long enough that it should not block the view. */
export const TOAST_MAXIMUM_MS = 7_000;

/**
 * Roughly 200 words per minute at an average of five characters per word, which
 * is the usual figure for on-screen reading — deliberately generous, since a
 * toast is read while attention is elsewhere.
 */
const MS_PER_CHARACTER = 45;

export function toastDurationMs(message: string): number {
  const reading = TOAST_MINIMUM_MS + message.length * MS_PER_CHARACTER;
  return Math.min(reading, TOAST_MAXIMUM_MS);
}
