import { beforeEach, describe, expect, it, vi } from "vitest";

const createFromBuffer = vi.hoisted(() => vi.fn());
const templateCalls = vi.hoisted(() => [] as ReturnType<typeof vi.fn>[]);
vi.mock("electron", () => ({ nativeImage: { createFromBuffer } }));
import { createTrayImage } from "@/apps/desktop/main/tray-image.js";

beforeEach(() => {
  createFromBuffer.mockReset();
  templateCalls.length = 0;
  createFromBuffer.mockImplementation(() => {
    const setTemplateImage = vi.fn();
    templateCalls.push(setTemplateImage);
    return { setTemplateImage };
  });
});

describe("native tray appearance", () => {
  it("uses macOS adaptive monochrome only at rest, including after a run", () => {
    const images = ["repos", "busy", "error", "repos"].map((state) =>
      createTrayImage(state as "repos" | "busy" | "error", "darwin"),
    );
    for (const [index, call] of templateCalls.entries()) {
      expect(call).toHaveBeenCalledWith(index === 0 || index === 3);
    }
    expect(images[0]).not.toBe(images[3]);
    expect(createFromBuffer.mock.calls.every(([bytes]) => Buffer.isBuffer(bytes))).toBe(true);
  });

  it.each(["win32", "linux"] as const)("retains colored icons on %s", (platform) => {
    for (const state of ["repos", "busy", "error"] as const) {
      createTrayImage(state, platform);
      expect(templateCalls.at(-1)).toHaveBeenCalledWith(false);
    }
  });
});
