import { beforeEach, describe, expect, it, vi } from "vitest";

const clipboardMock = vi.hoisted(() => ({
  read: vi.fn<() => Promise<string>>(),
  write: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock("clipboardy", () => ({ default: clipboardMock }));

import { writeClipboard } from "../../src/clipboard/clipboard.js";

describe("clipboard writes", () => {
  beforeEach(() => {
    clipboardMock.read.mockReset();
    clipboardMock.write.mockReset();
  });

  it("verifies that the complete rewritten prompt reached the clipboard", async () => {
    clipboardMock.write.mockResolvedValue();
    clipboardMock.read.mockResolvedValue("Prompt final\navec contexte");

    await expect(writeClipboard("Prompt final\navec contexte")).resolves.toBeUndefined();
    expect(clipboardMock.write).toHaveBeenCalledWith("Prompt final\navec contexte");
    expect(clipboardMock.read).toHaveBeenCalledOnce();
  });

  it("rejects a clipboard write that did not persist", async () => {
    clipboardMock.write.mockResolvedValue();
    clipboardMock.read.mockResolvedValue("ancien contenu");

    await expect(writeClipboard("nouveau contenu")).rejects.toThrow(
      "la vérification du contenu a échoué",
    );
  });
});
