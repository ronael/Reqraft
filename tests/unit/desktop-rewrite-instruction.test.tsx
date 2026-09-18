/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DESIGN_INPUT, DESIGN_WRAPPED } from "../fixtures/delegated-design-rewrite.js";
import { assessFidelity } from "@/core/fidelity.js";
import { champResultat, EN, monterCapsule, repromptResult } from "./desktop-capsule-harness.js";

afterEach(cleanup);

it.each([
  ["ema conv :", 'Clarifie et reformule la demande suivante : "ema conv :"'],
  [DESIGN_INPUT, DESIGN_WRAPPED],
])("shows the added instruction warning for %s", async (input, output) => {
  const harness = monterCapsule({ capture: { text: input, sourceApp: "ChatGPT" } });
  await waitFor(() => {
    expect(harness.bridge.startReprompt).toHaveBeenCalledOnce();
  });
  const result = repromptResult(output, input);
  result.profile = "clean";
  result.quality = assessFidelity(input, output, "balanced", "standard");

  await waitFor(() => {
    harness.push.done({ runId: harness.dernierRunId(), result });
    expect(champResultat().value).toBe(output);
  });

  expect(screen.getByText(EN["capsule.rewriteInstruction"])).toBeDefined();
  expect(screen.getByText(EN["capsule.rewriteInstructionDetail"])).toBeDefined();
  expect(document.querySelector(".capsule-footer")?.textContent).not.toContain("faithful");
});
