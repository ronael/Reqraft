/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PopoverApp } from "@/apps/desktop/renderer/popover/PopoverApp.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import type {
  RepromptResult,
  ReqraftBridge,
  RunDonePayload,
} from "@/apps/desktop/shared/ipc-contract.js";
import { DESKTOP_EN } from "@/i18n/desktop/en.js";

afterEach(() => {
  cleanup();
});

describe("le résultat du popover", () => {
  it("défile seul et garde copier dans le pied fixe", async () => {
    const done: ((payload: RunDonePayload) => void)[] = [];
    const acceptResult = vi.fn(() => Promise.resolve({ applied: true }));
    const startReprompt = vi.fn(() => Promise.resolve({ runId: "run-1" }));

    window.reqraft = {
      readLocale: () => Promise.resolve({ locale: "en", messages: DESKTOP_EN }),
      profileCatalog: () => Promise.resolve({ entries: [], problems: [] }),
      startReprompt,
      acceptResult,
      openSettings: () => Promise.resolve(),
      onRunDelta: () => () => undefined,
      onRunDone: (listener: (payload: RunDonePayload) => void) => {
        done.push(listener);
        return () => undefined;
      },
      onRunError: () => () => undefined,
      onRunCancelled: () => () => undefined,
    } as unknown as ReqraftBridge;

    render(
      <TranslationProvider>
        <PopoverApp />
      </TranslationProvider>,
    );

    const user = userEvent.setup({ document });
    await user.type(await screen.findByPlaceholderText(/type/i), "Rewrite this");
    await user.click(screen.getByRole("button", { name: /reformulate/i }));
    await waitFor(() => {
      expect(startReprompt).toHaveBeenCalledTimes(1);
    });

    const result: RepromptResult = {
      original: "Rewrite this",
      rewritten: Array.from({ length: 30 }, (_, index) => `Line ${String(index + 1)}`).join("\n"),
      profile: "writing",
      level: "standard",
      provider: "mock",
      model: "mock-model",
      changes: [],
      quality: { status: "good", signals: [] },
      latencyMs: 10,
    };
    act(() => {
      for (const listener of done) listener({ runId: "run-1", result });
    });

    expect(await screen.findByText(/Line 30/)).toBeDefined();
    const copy = screen.getByRole("button", { name: /copy/i });
    expect(copy.closest(".popover-footer")).not.toBeNull();
    expect(copy.closest(".popover-content")).toBeNull();
    expect(screen.getByText(/Line 30/).closest(".popover-content")).not.toBeNull();

    await user.click(copy);
    await waitFor(() => {
      expect(acceptResult).toHaveBeenCalledWith("run-1", "copy");
    });
  });
});
