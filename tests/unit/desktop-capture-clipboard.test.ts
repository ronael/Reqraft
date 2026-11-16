import { describe, expect, it } from "vitest";
import {
  createCaptureClipboard,
  type ElectronClipboard,
} from "@/apps/desktop/main/capture-clipboard.js";

interface FakeImage {
  isEmpty: () => boolean;
}

/** Electron's clipboard, reduced to what the capture touches. */
function fakeElectronClipboard(initial: {
  text?: string;
  html?: string;
  rtf?: string;
  image?: FakeImage;
}) {
  const state = { ...initial };
  const calls: string[] = [];
  const clipboard = {
    readText: () => state.text ?? "",
    writeText: (text: string) => {
      calls.push("writeText");
      Object.assign(state, { text, html: undefined, rtf: undefined, image: undefined });
    },
    availableFormats: () => [],
    readHTML: () => state.html ?? "",
    readRTF: () => state.rtf ?? "",
    readImage: () => state.image ?? { isEmpty: () => true },
    write: (data: { text?: string; html?: string; rtf?: string; image?: FakeImage }) => {
      calls.push("write");
      Object.assign(state, { text: undefined, html: undefined, rtf: undefined, image: undefined });
      Object.assign(state, data);
    },
    clear: () => {
      calls.push("clear");
      Object.assign(state, { text: undefined, html: undefined, rtf: undefined, image: undefined });
    },
  };
  return { clipboard: clipboard as unknown as ElectronClipboard, state, calls };
}

describe("presse-papiers de capture sur Electron", () => {
  it("rend le texte, le HTML et le texte riche d'un seul coup", () => {
    const { clipboard, state } = fakeElectronClipboard({
      text: "titre",
      html: "<b>titre</b>",
      rtf: "{\\rtf1 titre}",
    });
    const capture = createCaptureClipboard(clipboard);

    const saved = capture.snapshot();
    capture.writeText("sentinelle");
    saved.restore();

    expect(saved.text).toBe("titre");
    expect(state).toEqual({ text: "titre", html: "<b>titre</b>", rtf: "{\\rtf1 titre}" });
  });

  it("garde aussi une image posée à côté du texte", () => {
    const image = { isEmpty: () => false };
    const { clipboard, state } = fakeElectronClipboard({ text: "légende", image });
    const capture = createCaptureClipboard(clipboard);

    const saved = capture.snapshot();
    capture.writeText("sentinelle");
    saved.restore();

    expect(state.image).toBe(image);
    expect(state.text).toBe("légende");
  });

  it("vide le presse-papiers qui l'était, au lieu d'y laisser une chaîne vide", () => {
    const { clipboard, calls } = fakeElectronClipboard({});
    const capture = createCaptureClipboard(clipboard);

    const saved = capture.snapshot();
    capture.writeText("sentinelle");
    saved.restore();

    expect(saved.text).toBe("");
    expect(calls).toEqual(["writeText", "clear"]);
  });
});
