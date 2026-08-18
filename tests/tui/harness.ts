import { afterEach } from "bun:test";
import { act } from "react";
import type { TestRendererSetup } from "@opentui/core/testing";

/**
 * Renderer lifecycle for the interaction tests.
 *
 * Each `testRender` boots a real `CliRenderer`, and every renderer registers
 * listeners on process-wide singletons — `TerminalConsoleCache` among them.
 * Left alive they accumulate until Node warns about a leaking EventTarget,
 * which is a real leak rather than noise: those renderers really are still
 * attached. `destroy()` is the documented teardown, and it is what invokes the
 * `onDestroy` hook `testRender` uses to unmount its React root.
 *
 * The cleanup is registered per file rather than on import. Bun caches this
 * module, so a top-level `afterEach` here would attach to whichever test file
 * happened to load it first and silently leave every other file without
 * teardown — which is exactly the bug this file exists to prevent.
 */
const mounted: TestRendererSetup[] = [];

/**
 * React's own flag for "act() is legal here". `testRender` sets it on the way
 * in and clears it on the way out, one renderer at a time.
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** Hands the setup back unchanged, after queuing it for teardown. */
export function trackRenderer(setup: TestRendererSetup): TestRendererSetup {
  mounted.push(setup);
  return setup;
}

/** Call once at the top of a test file that mounts renderers. */
export function registerRendererTeardown(): void {
  afterEach(() => {
    // Reverse order: the most recently mounted renderer owns the terminal.
    for (const setup of [...mounted].reverse()) {
      // `testRender`'s onDestroy clears the act environment as its last step,
      // because it assumes one renderer per test. A test that mounted several
      // would unmount the rest outside a configured environment, so the flag
      // is re-armed before each destroy rather than once around the loop.
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;

      // `destroy()` unmounts the React root, which is a React update and
      // therefore belongs inside `act`.
      act(() => {
        setup.renderer.destroy();
      });
    }

    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    mounted.length = 0;
  });
}
