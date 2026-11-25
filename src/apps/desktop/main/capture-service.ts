import {
  captureSelection,
  describeNativeFailure,
  replaceSelection,
  type CaptureClipboard,
  type ReplaceOutcome,
} from "./capture.js";
import { FocusTracker } from "./focus.js";
import type { DesktopNativeBridge } from "./native-bridge.js";
import type { CaptureSelectionResponse } from "@/apps/desktop/shared/ipc-contract.js";
import { t } from "./i18n.js";

/**
 * Orchestrates the trigger cycle: global shortcut → record the source app →
 * capture its selection → hand the text to the capsule → reinject on accept.
 *
 * The captured text is stashed, not pushed: the renderer asks for it through
 * `capture:selection` once the capsule is ready, which keeps §8.1's contract
 * as the single definition of channels.
 */
export interface CaptureServiceDependencies {
  bridge: DesktopNativeBridge;
  clipboard: CaptureClipboard;
  focus?: FocusTracker;
}

export class CaptureService {
  private readonly focus: FocusTracker;
  private stashed: CaptureSelectionResponse | null = null;
  private running: Promise<CaptureSelectionResponse> | null = null;

  constructor(private readonly dependencies: CaptureServiceDependencies) {
    this.focus = dependencies.focus ?? new FocusTracker();
  }

  /**
   * Runs when the global shortcut fires: records the frontmost app BEFORE
   * the capsule takes the focus, then captures its selection.
   *
   * A second press while a capture runs joins it. Two captures at once each
   * saved and restored the clipboard over the other, and the clipboard could
   * end up holding the capture's sentinel.
   */
  async trigger(): Promise<CaptureSelectionResponse> {
    this.running ??= this.capture().finally(() => {
      this.running = null;
    });
    return await this.running;
  }

  private async capture(): Promise<CaptureSelectionResponse> {
    const { bridge, clipboard } = this.dependencies;
    const sourceApp = await this.focus.remember(bridge);
    const outcome = await captureSelection({
      clipboard,
      readSelection: bridge.readSelection,
      sendKeystroke: bridge.sendKeystroke,
      activateApp: bridge.activateApp,
    });

    // A source app that could not be identified no longer drops the text:
    // the capsule still rewrites it, and the result is copied instead of
    // pasted back.
    this.stashed =
      "text" in outcome
        ? { text: outcome.text, sourceApp }
        : {
            empty: true,
            // La raison remonte telle quelle : c'est la seule chose qui distingue
            // « rien de sélectionné » de « permission refusée ».
            reason: outcome.reason,
            ...(outcome.clipboardText === undefined
              ? {}
              : { clipboardText: outcome.clipboardText }),
          };
    return this.stashed;
  }

  /**
   * An agent's draft, handed over by `rp edit`: stashed like a captured
   * selection, with the frontmost app (the terminal) recorded as the one to
   * give the focus back to.
   */
  async stashAgentDraft(text: string): Promise<string | null> {
    const sourceApp = await this.focus.remember(this.dependencies.bridge);
    this.stashed = { text, sourceApp };
    return sourceApp;
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
   *
   * A failure is an outcome, never a rejection. The capsule is hidden while
   * the paste runs, and only `applied: false` brings it back: a rejection left
   * it hidden, with the result and the error message inside it.
   */
  async replace(text: string): Promise<ReplaceOutcome> {
    const sourceApp = this.focus.current;
    if (sourceApp === null) {
      return { applied: false, reason: t("main.replaceSourceUnknown") };
    }
    const { bridge, clipboard } = this.dependencies;
    try {
      return await replaceSelection(text, sourceApp, {
        clipboard,
        sendKeystroke: bridge.sendKeystroke,
        activateApp: bridge.activateApp,
      });
    } catch (error) {
      return {
        applied: false,
        reason: describeNativeFailure(error, (detail) => t("main.replaceFailed", { detail })),
      };
    }
  }

  clear(): void {
    this.stashed = null;
    this.focus.clear();
  }
}
