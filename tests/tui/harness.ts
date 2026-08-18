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

/** Hands the setup back unchanged, after queuing it for teardown. */
export function trackRenderer(setup: TestRendererSetup): TestRendererSetup {
  mounted.push(setup);
  return setup;
}

/** Call once at the top of a test file that mounts renderers. */
export function registerRendererTeardown(): void {
  afterEach(() => {
    // `destroy()` unmounts the React root through `testRender`'s onDestroy
    // hook, so the teardown itself is a React update and belongs inside `act`.
    act(() => {
      // Reverse order: the most recently mounted renderer owns the terminal.
      for (const setup of [...mounted].reverse()) {
        setup.renderer.destroy();
      }
    });
    mounted.length = 0;
  });
}
