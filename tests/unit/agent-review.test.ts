import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAppReview } from "@/agents/review-client.js";
import { reviewSocketPath, type ReviewResponse } from "@/agents/review-protocol.js";
import { AgentDrafts, type AgentDraftDependencies } from "@/apps/desktop/main/agent-drafts.js";
import {
  startAgentReviewServer,
  type AgentReviewServer,
} from "@/apps/desktop/main/agent-review-server.js";

/**
 * `rp edit` and the desktop app, over a real socket in a temporary directory.
 */

let directory: string | undefined;
let server: AgentReviewServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function socketIn(): Promise<string> {
  directory = await mkdtemp(path.join(os.tmpdir(), "rq-review-"));
  return path.join(directory, "agent-review.sock");
}

describe("le chemin du socket", () => {
  it("vit dans le dossier de configuration, ou dans un named pipe sous Windows", () => {
    expect(reviewSocketPath("darwin", "/Users/ada/.config/rp", "ada")).toBe(
      "/Users/ada/.config/rp/agent-review.sock",
    );
    expect(reviewSocketPath("win32", "C:\\\\x", "ada")).toBe(
      "\\\\.\\pipe\\reqraft-agent-review-ada",
    );
  });
});

describe("rp edit et l'app", () => {
  it("rend la réponse de l'app, et prévient quand elle a pris la main", async () => {
    const socketPath = await socketIn();
    server = await startAgentReviewServer(socketPath, {
      review: (draft) => Promise.resolve({ result: "kept", text: `${draft}, réécrit` }),
    });
    const connected = vi.fn();
    const answer = await requestAppReview("mon brouillon", { socketPath, onConnected: connected });
    expect(answer).toEqual({ result: "kept", text: "mon brouillon, réécrit" });
    expect(connected).toHaveBeenCalledTimes(1);
  });

  it("dit indisponible quand l'app n'est pas ouverte", async () => {
    const socketPath = await socketIn();
    expect(await requestAppReview("x", { socketPath })).toEqual({ result: "unavailable" });
  });

  it("ferme une connexion qui n'envoie pas une demande valide", async () => {
    const socketPath = await socketIn();
    const review = vi.fn();
    server = await startAgentReviewServer(socketPath, { review });
    const closed = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(socketPath, () => {
        socket.write('{"version":2,"draft":"x"}\n');
      });
      socket.on("close", () => {
        resolve(true);
      });
    });
    expect(closed).toBe(true);
    expect(review).not.toHaveBeenCalled();
  });

  it("prévient l'app quand rp edit s'en va avant la réponse", async () => {
    const socketPath = await socketIn();
    const aborted = new Promise<void>((resolve) => {
      void startAgentReviewServer(socketPath, {
        review: (_draft, signal) =>
          new Promise<ReviewResponse>(() => {
            signal.addEventListener("abort", () => {
              resolve();
            });
          }),
      }).then((started) => {
        server = started;
        const socket = net.createConnection(socketPath, () => {
          socket.write(`${JSON.stringify({ version: 1, draft: "x" })}\n`);
          setTimeout(() => socket.destroy(), 50);
        });
      });
    });
    await expect(aborted).resolves.toBeUndefined();
  });
});

describe("un brouillon d'agent dans la capsule", () => {
  function drafts() {
    const calls: string[] = [];
    let hidden: (() => void) | null = null;
    const dependencies: AgentDraftDependencies = {
      stash: (draft) => {
        calls.push(`stash:${draft}`);
        return Promise.resolve("Hyper");
      },
      open: (onHidden) => {
        calls.push("open");
        hidden = onHidden;
      },
      hide: () => calls.push("hide"),
      activate: (app) => {
        calls.push(`activate:${app}`);
        return Promise.resolve(true);
      },
      clear: () => calls.push("clear"),
    };
    return { sessions: new AgentDrafts(dependencies), calls, hide: () => hidden?.() };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("rend le texte accepté, cache la capsule et ramène le terminal", async () => {
    const { sessions, calls } = drafts();
    const answer = sessions.review("brouillon", new AbortController().signal);
    await settle();
    expect(sessions.active).toBe(true);
    sessions.accept("réécrit");
    expect(await answer).toEqual({ result: "kept", text: "réécrit" });
    expect(calls).toEqual(["stash:brouillon", "open", "hide", "clear", "activate:Hyper"]);
    expect(sessions.active).toBe(false);
  });

  it("annule quand la capsule se ferme, ou quand rp edit s'en va", async () => {
    const closed = drafts();
    const first = closed.sessions.review("a", new AbortController().signal);
    await settle();
    closed.hide();
    expect(await first).toEqual({ result: "cancelled" });

    const left = drafts();
    const controller = new AbortController();
    const second = left.sessions.review("b", controller.signal);
    await settle();
    controller.abort();
    expect(await second).toEqual({ result: "cancelled" });
  });

  it("répond occupé à un second brouillon pendant le premier", async () => {
    const { sessions } = drafts();
    const first = sessions.review("a", new AbortController().signal);
    expect(await sessions.review("b", new AbortController().signal)).toEqual({ result: "busy" });
    await settle();
    sessions.cancel();
    expect(await first).toEqual({ result: "cancelled" });
  });
});
