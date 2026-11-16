/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";
import {
  champResultat,
  DEFAULT_CAPTURE_TEXT,
  EN,
  monterCapsule,
  repromptResult,
  type CapsuleHarness,
} from "./desktop-capsule-harness.js";

/**
 * « baisser le niveau », la touche offerte devant un résultat trop long.
 *
 * Elle appelait le cycle vers le haut : depuis `standard`, elle relançait en
 * `complete`, c'est-à-dire plus long encore, et depuis `minimal` elle
 * repartait en `complete`.
 */

afterEach(cleanup);

/** Un résultat que la vérification de fidélité trouve trop long. */
function tropLong(level: RepromptResult["level"]): RepromptResult {
  return {
    ...repromptResult(`A rewrite far longer than asked, at ${level}.`),
    level,
    quality: {
      status: "review",
      signals: [{ code: "disproportionate_expansion", severity: "warning" }],
    },
  };
}

/** Attend le run numéro `run`, puis livre son résultat. */
async function livrer(harness: CapsuleHarness, run: number, result: RepromptResult): Promise<void> {
  await waitFor(() => {
    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(run);
  });
  await waitFor(() => {
    harness.push.done({ runId: harness.dernierRunId(), result });
    expect(champResultat().value).toBe(result.rewritten);
  });
}

const baisser = (): HTMLElement | null =>
  screen.queryByRole("button", { name: new RegExp(EN["capsule.lowerLevel"], "i") });

async function cliquer(harness: CapsuleHarness, button: HTMLElement | null): Promise<void> {
  expect(button).not.toBeNull();
  if (button !== null) await harness.user.click(button);
}

it("goes one level down, to minimal, and offers nothing below it", async () => {
  const harness = monterCapsule();
  await livrer(harness, 1, tropLong("standard"));

  // ⇧⇥ is the key that goes down; ⇥ goes up.
  expect(baisser()?.textContent).toContain("⇧⇥");
  await cliquer(harness, baisser());
  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: DEFAULT_CAPTURE_TEXT,
    level: "minimal",
  });

  await livrer(harness, 2, tropLong("minimal"));
  expect(baisser()).toBeNull();
  expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(2);
});

it("goes from complete down to standard", async () => {
  const harness = monterCapsule();
  await livrer(harness, 1, repromptResult("A fitting rewrite."));
  await cliquer(harness, screen.getByRole("button", { name: `⇥ ${EN["capsule.level"]}` }));
  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: DEFAULT_CAPTURE_TEXT,
    level: "complete",
  });
  await livrer(harness, 2, tropLong("complete"));

  await cliquer(harness, baisser());

  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: DEFAULT_CAPTURE_TEXT,
    level: "standard",
  });
});
