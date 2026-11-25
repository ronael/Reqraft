import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getConfigDir } from "@/config/paths.js";

/**
 * Reviewing an agent's draft in the desktop app.
 *
 * When the app is open, `rp edit` hands it the draft and waits: the capsule
 * shows before and after, and the answer comes back on the same connection.
 * One JSON line each way, over a socket in Reqraft's configuration directory
 * that only this account can open (a named pipe on Windows).
 */

/** A draft bigger than this is not a prompt; the terminal review handles it. */
export const MAX_REVIEW_DRAFT_LENGTH = 200_000;

export const ReviewRequestSchema = z
  .object({ version: z.literal(1), draft: z.string().min(1).max(MAX_REVIEW_DRAFT_LENGTH) })
  .strict();
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

export const ReviewResponseSchema = z.discriminatedUnion("result", [
  /** Accepted in the capsule: the text to write back. */
  z.object({ result: z.literal("kept"), text: z.string().min(1) }).strict(),
  /** Closed without accepting: the draft stays as it was. */
  z.object({ result: z.literal("cancelled") }).strict(),
  /** Another draft is under review: `rp edit` falls back to the terminal. */
  z.object({ result: z.literal("busy") }).strict(),
]);
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

export function reviewSocketPath(
  platform: NodeJS.Platform = process.platform,
  configDir: string = getConfigDir(),
  user: string = os.userInfo().username,
): string {
  if (platform === "win32") return `\\\\.\\pipe\\reqraft-agent-review-${user}`;
  return path.join(configDir, "agent-review.sock");
}

/** One message per line; anything else is not a message. */
export function readMessage<T>(line: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
