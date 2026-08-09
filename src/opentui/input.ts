import type { KeyEvent } from "@opentui/core";
import { stripVTControlCharacters } from "node:util";

import { previewRewritten } from "../core/stream-preview.js";

const BRACKETED_PASTE_START = "\u001B[200~";
const BRACKETED_PASTE_END = "\u001B[201~";

export function isCtrlCKey(key: Pick<KeyEvent, "ctrl" | "name" | "sequence">): boolean {
  return key.sequence === "\u0003" || (key.ctrl && (key.name === "c" || key.sequence === "c"));
}

export function isCtrlVKey(key: Pick<KeyEvent, "ctrl" | "name" | "sequence">): boolean {
  return key.sequence === "\u0016" || (key.ctrl && (key.name === "v" || key.sequence === "v"));
}

export function normalizeTypedText(sequence: string): string {
  const withoutPasteMarkers = stripVTControlCharacters(sequence)
    .replaceAll(BRACKETED_PASTE_START, "")
    .replaceAll(BRACKETED_PASTE_END, "");
  let output = "";

  for (const character of withoutPasteMarkers) {
    if (character === "\n" || character === "\t" || character >= " ") {
      output += character;
    }
  }

  return output;
}

export function appendPastedText(currentInput: string, pastedText: string): string {
  return `${currentInput}${normalizeTypedText(pastedText)}`;
}

export function decodePastedText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function resolveStreamedResultPreview(partialText: string): string {
  const preview = previewRewritten(partialText);
  return preview.kind === "pending" ? "" : preview.text;
}
