import { describe, expect, it } from "vitest";
import {
  appendPastedText,
  decodePastedText,
  isCtrlCKey,
  normalizeTypedText,
  resolveStreamedResultPreview,
} from "@/apps/cli/opentui/input.js";
import { createOpenTuiRendererOptions } from "@/apps/cli/opentui/renderer-options.js";
import { resolveSubmit } from "@/apps/cli/ui/prompt-input.js";
import { RESERVED_CTRL_KEYS, resolveShortcut } from "@/apps/cli/ui/shortcuts.js";

describe("interactive keyboard contract", () => {
  it("never reserves terminal control keys that collapse to editing keys", () => {
    expect([...RESERVED_CTRL_KEYS]).toEqual(["h", "i", "j", "m"]);
  });

  it("keeps Ctrl shortcuts out of the prompt input path", () => {
    expect(
      resolveShortcut(
        "p",
        { ctrl: true, escape: false },
        {
          hasModal: false,
          hasResult: false,
          inputLength: 4,
          isGenerating: false,
        },
      ),
    ).toBe("open-profile");
  });

  it("captures keys while a modal is open", () => {
    expect(
      resolveShortcut(
        "p",
        { ctrl: true, escape: false },
        {
          hasModal: true,
          hasResult: false,
          inputLength: 4,
          isGenerating: false,
        },
      ),
    ).toBeNull();
  });

  it("uses a trailing backslash for multiline input", () => {
    expect(resolveSubmit("première ligne\\")).toEqual({
      type: "newline",
      input: "première ligne\n",
    });
  });

  it("generates on Enter without a continuation marker", () => {
    expect(resolveSubmit("fais une landing page")).toEqual({
      type: "generate",
      input: "fais une landing page",
    });
  });

  it("recognizes Ctrl+C from terminal control sequences", () => {
    expect(isCtrlCKey({ ctrl: true, name: "c", sequence: "c" })).toBe(true);
    expect(isCtrlCKey({ ctrl: false, name: "", sequence: "\u0003" })).toBe(true);
  });

  it("keeps pasted multiline text while stripping terminal paste markers", () => {
    expect(normalizeTypedText("\u001B[200~ligne 1\nligne 2\u001B[201~")).toBe("ligne 1\nligne 2");
  });

  it("appends native OpenTUI paste events without flattening multiline text", () => {
    const pastedText = decodePastedText(new TextEncoder().encode("ligne 1\nligne 2"));

    expect(appendPastedText("Contexte :\n", pastedText)).toBe("Contexte :\nligne 1\nligne 2");
  });

  it("removes terminal control sequences from pasted text", () => {
    expect(appendPastedText("", "\u001b[31mtexte rouge\u001b[0m")).toBe("texte rouge");
  });

  it("does not display raw JSON envelopes while streaming", () => {
    expect(resolveStreamedResultPreview('{"rewritten":"Crée une page')).toBe("Crée une page");
    expect(resolveStreamedResultPreview('{"warnings":[')).toBe("");
  });

  it("keeps Ctrl+C owned by the app, not by OpenTUI's native shutdown", () => {
    // Ctrl+C is routed by the application (cancel while generating, exit
    // otherwise). If the renderer also exited on the key, a mid-run cancel
    // would be impossible and the path would be duplicated.
    expect(createOpenTuiRendererOptions()).toMatchObject({
      exitOnCtrlC: false,
      useMouse: true,
    });
  });
});
