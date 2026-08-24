import {
  captureSelection,
  replaceSelection,
  type CaptureClipboard,
  type ReplaceOutcome,
} from "./capture.js";
import { FocusTracker } from "./focus.js";
import type { MacosBridge } from "./macos.js";
import type { CaptureSelectionResponse } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Orchestrates the trigger cycle: global shortcut → record the source app →
 * capture its selection → hand the text to the capsule → reinject on accept.
 *
 * The captured text is stashed, not pushed: the renderer asks for it through
 * `capture:selection` once the capsule is ready, which keeps §8.1's contract
 * as the single definition of channels.
 */
export interface CaptureServiceDependencies {
  bridge: MacosBridge;
  clipboard: CaptureClipboard;
  focus?: FocusTracker;
}

export class CaptureService {
  private readonly focus: FocusTracker;
  private stashed: CaptureSelectionResponse | null = null;

  constructor(private readonly dependencies: CaptureServiceDependencies) {
    this.focus = dependencies.focus ?? new FocusTracker();
  }

  /**
   * Runs when the global shortcut fires: records the frontmost app BEFORE
   * the capsule takes the focus, then captures its selection.
   */
  async trigger(): Promise<CaptureSelectionResponse> {
    const sourceApp = await this.focus.remember(this.dependencies.bridge);
    const outcome = await captureSelection({
      clipboard: this.dependencies.clipboard,
      sendKeystroke: this.dependencies.bridge.sendKeystroke,
      activateApp: this.dependencies.bridge.activateApp,
    });

    this.stashed =
      "text" in outcome && sourceApp !== null
        ? { text: outcome.text, sourceApp }
        : // La raison remonte telle quelle : c'est la seule chose qui distingue
          // « rien de sélectionné » de « permission refusée ».
          { empty: true, ...("reason" in outcome ? { reason: outcome.reason } : {}) };
    return this.stashed;
  }

  /**
   * What the renderer gets through `capture:selection`. Without a prior
   * trigger there is nothing to give: the capsule opens in free-input mode.
   */
  consumeStashed(): CaptureSelectionResponse {
    return this.stashed ?? { empty: true };
  }

  /** The recorded source app, used by `result:accept` in replace mode. */
  get sourceApp(): string | null {
    return this.focus.current;
  }

  /**
   * Reinjects `text` into the recorded source app. Never targets whatever is
   * frontmost now — that would be the capsule itself (§5.2).
   */
  async replace(text: string): Promise<ReplaceOutcome> {
    const sourceApp = this.focus.current;
    if (sourceApp === null) {
      return { applied: false, reason: "application source inconnue" };
    }
    return await replaceSelection(text, sourceApp, {
      clipboard: this.dependencies.clipboard,
      sendKeystroke: this.dependencies.bridge.sendKeystroke,
      activateApp: this.dependencies.bridge.activateApp,
    });
  }

  clear(): void {
    this.stashed = null;
    this.focus.clear();
  }
}
