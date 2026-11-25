import type { ReviewResponse } from "@/agents/review-protocol.js";
import type { AgentReviewHandler } from "./agent-review-server.js";

/**
 * One agent draft under review in the capsule.
 *
 * The draft takes the capture's path: stashed like a selection, with the
 * terminal recorded as the source app, then shown and rewritten as usual.
 * Only the end differs: accepting hands the text back to `rp edit` instead of
 * pasting it, and the terminal comes back to the front either way.
 */
export interface AgentDraftDependencies {
  /** Records the frontmost app and stashes the draft; returns that app. */
  stash(draft: string): Promise<string | null>;
  /** Shows the capsule on the stashed draft; `onHidden` runs when it hides. */
  open(onHidden: () => void): void;
  hide(): void;
  activate(app: string): Promise<unknown>;
  /** Forgets the stash and the recorded app, as after any capture. */
  clear(): void;
}

interface Pending {
  resolve(response: ReviewResponse): void;
  sourceApp: string | null;
}

export class AgentDrafts implements AgentReviewHandler {
  /** The draft on screen; set once the capsule shows it. */
  private pending: Pending | null = null;
  /** Taken from the request until its review ends, the stash included. */
  private busy = false;

  constructor(private readonly dependencies: AgentDraftDependencies) {}

  /** True while a draft is in the capsule: `result:accept` answers it. */
  get active(): boolean {
    return this.pending !== null;
  }

  async review(draft: string, signal: AbortSignal): Promise<ReviewResponse> {
    // One at a time: the capsule has one session, and a second agent falls
    // back to its own terminal rather than taking the first one's place.
    if (this.busy) return { result: "busy" };
    this.busy = true;
    try {
      const sourceApp = await this.dependencies.stash(draft);
      if (signal.aborted) {
        // `rp edit` left while the terminal was being recorded.
        this.dependencies.clear();
        return { result: "cancelled" };
      }
      return await new Promise<ReviewResponse>((resolve) => {
        this.pending = { resolve, sourceApp };
        signal.addEventListener(
          "abort",
          () => {
            this.finish({ result: "cancelled" });
          },
          { once: true },
        );
        this.dependencies.open(() => {
          this.finish({ result: "cancelled" });
        });
      });
    } finally {
      this.busy = false;
    }
  }

  /** Accepted in the capsule: the text goes back to the agent. */
  accept(text: string): void {
    this.finish({ result: "kept", text });
  }

  /** Copied or dismissed: the agent keeps its draft. */
  cancel(): void {
    this.finish({ result: "cancelled" });
  }

  private finish(response: ReviewResponse): void {
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;
    this.dependencies.hide();
    this.dependencies.clear();
    pending.resolve(response);
    if (pending.sourceApp !== null) {
      void this.dependencies.activate(pending.sourceApp).catch(() => undefined);
    }
  }
}
