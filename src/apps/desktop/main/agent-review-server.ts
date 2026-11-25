import { chmod, unlink } from "node:fs/promises";
import net from "node:net";
import {
  MAX_REVIEW_DRAFT_LENGTH,
  readMessage,
  ReviewRequestSchema,
  type ReviewResponse,
} from "@/agents/review-protocol.js";

/**
 * The desktop end of `rp edit`'s review: one connection per draft, one JSON
 * line in, one JSON line out. The socket lives in Reqraft's configuration
 * directory and is made readable by this account only; on Windows it is a
 * named pipe, which the same account owns.
 */

export interface AgentReviewHandler {
  /**
   * Shows the draft and resolves with the person's answer. `signal` aborts
   * when `rp edit` goes away: the review must then close by itself.
   */
  review(draft: string, signal: AbortSignal): Promise<ReviewResponse>;
}

export interface AgentReviewServer {
  close(): Promise<void>;
}

export async function startAgentReviewServer(
  socketPath: string,
  handler: AgentReviewHandler,
  platform: NodeJS.Platform = process.platform,
): Promise<AgentReviewServer> {
  // The app runs as a single instance: a socket file left here is stale.
  if (platform !== "win32") await unlink(socketPath).catch(() => undefined);

  const server = net.createServer((socket) => {
    const abort = new AbortController();
    let buffer = "";
    let handled = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      if (handled) return;
      buffer += chunk;
      // The draft is bounded by the schema; a line far longer is not ours.
      if (buffer.length > MAX_REVIEW_DRAFT_LENGTH * 4) {
        socket.destroy();
        return;
      }
      const end = buffer.indexOf("\n");
      if (end === -1) return;
      handled = true;
      const request = readMessage(buffer.slice(0, end), ReviewRequestSchema);
      if (request === null) {
        socket.destroy();
        return;
      }
      void handler
        .review(request.draft, abort.signal)
        .then((response) => {
          if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`);
        })
        .catch(() => {
          socket.destroy();
        });
    });
    socket.on("close", () => {
      abort.abort();
    });
    socket.on("error", () => {
      abort.abort();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (platform !== "win32") await chmod(socketPath, 0o600);

  return {
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
