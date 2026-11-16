import type { CaptureClipboard, ClipboardSnapshot } from "./capture.js";

/** The part of Electron's clipboard the capture uses, injectable in tests. */
export type ElectronClipboard = Pick<
  Electron.Clipboard,
  | "readText"
  | "writeText"
  | "availableFormats"
  | "readHTML"
  | "readRTF"
  | "readImage"
  | "write"
  | "clear"
>;

/**
 * The capture's clipboard on top of Electron's.
 *
 * The snapshot keeps every format Electron can write back in a single
 * `clipboard.write`: plain text, HTML, rich text and image. Saving the text
 * alone turned a rich-text copy from Word or a web page into plain text each
 * time the capture had to fall back on ⌘C. Other formats, such as files copied
 * in the Finder, still cannot be put back.
 */
export function createCaptureClipboard(clipboard: ElectronClipboard): CaptureClipboard {
  return {
    readText: () => clipboard.readText(),
    writeText: (text) => {
      clipboard.writeText(text);
    },
    availableFormats: () => clipboard.availableFormats(),
    snapshot: () => snapshotOf(clipboard),
  };
}

function snapshotOf(clipboard: ElectronClipboard): ClipboardSnapshot {
  const text = clipboard.readText();
  const html = clipboard.readHTML();
  const rtf = clipboard.readRTF();
  const image = clipboard.readImage();

  const data: Electron.Data = {};
  if (text !== "") data.text = text;
  if (html !== "") data.html = html;
  if (rtf !== "") data.rtf = rtf;
  if (!image.isEmpty()) data.image = image;

  return {
    text,
    restore: () => {
      if (Object.keys(data).length === 0) {
        clipboard.clear();
        return;
      }
      clipboard.write(data);
    },
  };
}
