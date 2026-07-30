import { render } from "ink-testing-library";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app.js";

vi.mock("../../src/application/bootstrap.js", () => ({
  bootstrapConfiguration: vi.fn().mockResolvedValue({
    config: {
      defaultProvider: "mock",
      defaultModel: "mock-model",
      defaultProfile: "auto",
      defaultLevel: "standard",
      providers: {},
      stream: true,
      showStats: false,
      showChanges: false,
      copyAfterGeneration: false,
      telemetry: false,
      fidelityMode: "balanced",
      timeoutMs: 30_000,
    },
  }),
  getBootstrapError: vi.fn().mockReturnValue(null),
}));

const ANSI_STYLE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;]*m`, "g");

/** Wait long enough for Ink's batched updates to land. */
async function flushFrames(count = 3): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** ANSI-stripped last frame. */
function frameOf(instance: ReturnType<typeof render>): string {
  return (instance.lastFrame() ?? "").replaceAll(ANSI_STYLE_PATTERN, "");
}

describe("keyboard input priority", () => {
  let instance: ReturnType<typeof render>;

  beforeEach(async () => {
    instance = render(<App />);
    await flushFrames();
  });

  it("types ordinary characters into the prompt", async () => {
    instance.stdin.write("hello");
    await flushFrames();

    expect(frameOf(instance)).toContain("hello");
    expect(frameOf(instance)).not.toContain("Changer");
  });

  it("opens profile picker on Ctrl+P without inserting p", async () => {
    instance.stdin.write("hello");
    await flushFrames(5);
    // Capture the input value before it can be affected by the modal open.
    const beforeFrame = frameOf(instance);
    expect(beforeFrame).toContain("hello");
    expect(beforeFrame).not.toContain("hellop");

    instance.stdin.write("\u0010"); // Ctrl+P
    await flushFrames(5);

    const frame = frameOf(instance);
    expect(frame).toContain("Changer de profil");
    expect(frame).not.toContain("hellop");
  });

  it("opens level picker on Ctrl+L without inserting l", async () => {
    instance.stdin.write("test");
    await flushFrames();
    instance.stdin.write("\u000C"); // Ctrl+L
    await flushFrames();

    const frame = frameOf(instance);
    expect(frame).toContain("Changer de niveau");
    expect(frame).not.toContain("testl");
  });

  it("opens model picker on Ctrl+O without inserting o", async () => {
    instance.stdin.write("test");
    await flushFrames();
    instance.stdin.write("\u000F"); // Ctrl+O
    await flushFrames();

    const frame = frameOf(instance);
    expect(frame).toContain("Changer de modèle");
    expect(frame).not.toContain("testo");
  });

  it("opens diff on Ctrl+D without inserting d", async () => {
    // A diff needs a result first; seed one by setting it through the public actions.
    instance.stdin.write("prompt initial");
    await flushFrames();

    // We cannot run a real generation here; instead we rely on the fact that
    // Ctrl+D only toggles the diff view and never types the letter.
    instance.stdin.write("\u0004"); // Ctrl+D
    await flushFrames();

    const frame = frameOf(instance);
    expect(frame).not.toContain("prompt initiald");
    // The view title should switch to "Diff".
    expect(frame).toContain("Diff");
  });

  it("opens command palette on Ctrl+K without inserting k", async () => {
    instance.stdin.write("abc");
    await flushFrames();
    instance.stdin.write("\u000B"); // Ctrl+K
    await flushFrames();

    const frame = frameOf(instance);
    expect(frame).toContain("Palette d’actions");
    expect(frame).not.toContain("abck");
  });

  it("keeps the editor from receiving keys while an overlay is open", async () => {
    instance.stdin.write("base");
    await flushFrames();
    instance.stdin.write("\u0010"); // open profile picker
    await flushFrames();

    instance.stdin.write("a");
    await flushFrames();

    const frame = frameOf(instance);
    expect(frame).toContain("Recherche : a");
    expect(frame).not.toContain("basea");
  });

  it("restores prompt focus after the overlay is closed", async () => {
    instance.stdin.write("base");
    await flushFrames();

    instance.stdin.write("\u0010"); // open profile picker
    await flushFrames();

    instance.stdin.write("\u001B"); // Escape
    await flushFrames();

    const afterClose = frameOf(instance);
    expect(afterClose).toContain("base");
    expect(afterClose).not.toContain("Changer de profil");

    instance.stdin.write("z");
    await flushFrames();

    expect(frameOf(instance)).toContain("basez");
    expect(frameOf(instance)).not.toContain("Palette");
  });
});
