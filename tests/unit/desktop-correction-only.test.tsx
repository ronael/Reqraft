/** @vitest-environment jsdom */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  arriveAuResultat,
  champPrompt,
  champResultat,
  commande,
  DEFAULT_CAPTURE_TEXT,
  EN,
  monterCapsule,
  repromptResult,
} from "./desktop-capsule-harness.js";

afterEach(cleanup);
const correction = (): HTMLElement =>
  screen.getByRole("button", { name: EN["capsule.correctOnly"] });

it("corrects the current source with clean/minimal, without reusing the generated output", async () => {
  const harness = monterCapsule();
  await arriveAuResultat(harness, "An overcomplicated result");
  await harness.user.clear(champPrompt());
  await harness.user.type(champPrompt(), "salut paul a demain");
  await harness.user.clear(champResultat());
  await harness.user.type(champResultat(), "Manually edited output");
  expect(screen.getByText(EN["capsule.sourceEditedVerdict"])).toBeDefined();
  await harness.user.click(correction());

  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: "salut paul a demain",
    profileId: "clean",
    level: "minimal",
  });
  expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: EN["capsule.correctOnly"] })).toBeNull();
});

it("shows preserved text as an outcome and updates the verdict after an edit", async () => {
  const harness = monterCapsule();
  await arriveAuResultat(harness, DEFAULT_CAPTURE_TEXT);
  expect(screen.getByText(EN["capsule.textPreserved"])).toBeDefined();
  await harness.user.type(champResultat(), " changed");
  expect(screen.getByText(EN["capsule.editedVerdict"])).toBeDefined();
  expect(screen.queryByText(EN["capsule.textPreserved"])).toBeNull();
});

it("does not call text preserved when the source was changed after generation", async () => {
  const harness = monterCapsule();
  await arriveAuResultat(harness, DEFAULT_CAPTURE_TEXT);
  await harness.user.type(champPrompt(), " demain");
  expect(screen.queryByText(EN["capsule.textPreserved"])).toBeNull();
  expect(screen.getByText("source edited · rerun")).toBeDefined();
});

it("works from comparison and keeps the choice for reruns within this session only", async () => {
  const harness = monterCapsule();
  await arriveAuResultat(harness, "Long result");
  await harness.user.click(commande(EN["capsule.compare"]));
  await harness.user.click(correction());
  const result = { ...repromptResult("Short result"), profile: "clean", level: "minimal" as const };
  await waitFor(() => {
    harness.push.done({ runId: harness.dernierRunId(), result });
    expect(champResultat().value).toBe(result.rewritten);
  });
  expect(document.querySelector(".capsule-diff")).toBeNull();
  expect(screen.queryByRole("button", { name: EN["capsule.correctOnly"] })).toBeNull();

  await harness.user.click(commande(EN["capsule.rerun"]));
  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: DEFAULT_CAPTURE_TEXT,
    profileId: "clean",
    level: "minimal",
  });

  await waitFor(() => {
    harness.push.opened({ id: 2, mode: "capture" });
    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(4);
  });
  expect(harness.bridge.startReprompt).toHaveBeenLastCalledWith({
    input: DEFAULT_CAPTURE_TEXT,
    level: "standard",
  });
});

it("refuses an empty source without starting a run", async () => {
  const harness = monterCapsule();
  await arriveAuResultat(harness, "Result");
  await harness.user.clear(champPrompt());
  await harness.user.click(correction());
  expect(harness.bridge.startReprompt).toHaveBeenCalledOnce();
  expect(screen.getByText(EN["capsule.promptEmpty"])).toBeDefined();
});

it("lets Enter activate the focused correction button without replacing the selection", async () => {
  const harness = monterCapsule();
  await arriveAuResultat(harness, "Result");
  correction().focus();
  await harness.user.keyboard("{Enter}");
  expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(2);
  expect(harness.bridge.acceptResult).not.toHaveBeenCalled();
});
