import net from "node:net";
import { readMessage, reviewSocketPath, ReviewResponseSchema } from "./review-protocol.js";
import type { ReviewResponse } from "./review-protocol.js";

/** What the app answered, or that no app could take the draft. */
export type AppReview = ReviewResponse | { result: "unavailable" };

export interface AppReviewOptions {
  socketPath?: string;
  /** Called once the app took the connection: the review is now on screen. */
  onConnected?: () => void;
  /** How long to wait for an app that may not be running. */
  connectTimeoutMs?: number;
}

/**
 * Hands `draft` to the desktop app and waits for the user's answer there.
 *
 * Never rejects: an app that is not running, a refused connection or a
 * connection closed without an answer all come back as `unavailable`, and
 * `rp edit` then reviews in the terminal. There is no timeout once connected:
 * the person may take their time in the capsule.
 */
export function requestAppReview(
  draft: string,
  options: AppReviewOptions = {},
): Promise<AppReview> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = "";
    const socket = net.createConnection(options.socketPath ?? reviewSocketPath());
    const finish = (answer: AppReview): void => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      socket.destroy();
      resolve(answer);
    };
    const connectTimer = setTimeout(() => {
      finish({ result: "unavailable" });
    }, options.connectTimeoutMs ?? 1500);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      clearTimeout(connectTimer);
      options.onConnected?.();
      socket.write(`${JSON.stringify({ version: 1, draft })}\n`);
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end === -1) return;
      finish(readMessage(buffer.slice(0, end), ReviewResponseSchema) ?? { result: "unavailable" });
    });
    socket.on("error", () => {
      finish({ result: "unavailable" });
    });
    socket.on("close", () => {
      finish({ result: "unavailable" });
    });
  });
}
