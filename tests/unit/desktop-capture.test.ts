import { describe, expect, it } from "vitest";
import {
  CAPTURE_SENTINEL_FOR_TESTS,
  captureSelection,
  replaceSelection,
  type CaptureClipboard,
  type CaptureDependencies,
} from "@/desktop/main/capture.js";
import { CaptureService } from "@/desktop/main/capture-service.js";
import type { MacosBridge } from "@/desktop/main/macos.js";

const SENTINEL = CAPTURE_SENTINEL_FOR_TESTS;

/** Clipboard fake: `appCopy(text)` simulates the target app answering ⌘C. */
class FakeClipboard implements CaptureClipboard {
  private content = "";
  private formats: string[] = [];
  readonly writes: string[] = [];

  readText(): string {
    return this.content;
  }

  writeText(text: string): void {
    this.writes.push(text);
    this.content = text;
    this.formats = ["public.utf8-plain-text"];
  }

  availableFormats(): string[] {
    return this.formats;
  }

  seedImage(): void {
    this.content = "";
    this.formats = ["public.png"];
  }

  appCopy(text: string): void {
    this.content = text;
  }

  get currentText(): string {
    return this.content;
  }
}

function immediateWait(): Promise<void> {
  return Promise.resolve();
}

function createDeps(clipboard: FakeClipboard): CaptureDependencies & {
  sentKeystrokes: string[];
} {
  const sentKeystrokes: string[] = [];
  return {
    clipboard,
    sentKeystrokes,
    sendKeystroke: (letter) => {
      sentKeystrokes.push(letter);
      return Promise.resolve();
    },
    activateApp: () => Promise.resolve(true),
    wait: immediateWait,
    copyTimeoutMs: 50,
    pollIntervalMs: 1,
    pasteSettleMs: 1,
  };
}

describe("captureSelection (DESKTOP.md §5.1)", () => {
  it("capture la sélection et restaure le presse-papiers", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("contenu original");
    const deps = createDeps(clipboard);
    // The target app answers ⌘C while the sentinel is in place.
    deps.sendKeystroke = (letter) => {
      deps.sentKeystrokes.push(letter);
      clipboard.appCopy("texte sélectionné");
      return Promise.resolve();
    };

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({ text: "texte sélectionné" });
    expect(deps.sentKeystrokes).toEqual(["c"]);
    expect(clipboard.currentText).toBe("contenu original");
  });

  it("distingue « aucune sélection » grâce à la sentinelle", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("contenu original");
    const deps = createDeps(clipboard);

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({ empty: true, reason: "aucune sélection" });
    expect(clipboard.currentText).toBe("contenu original");
  });

  it("refuse un presse-papiers non textuel sans y toucher", async () => {
    const clipboard = new FakeClipboard();
    clipboard.seedImage();
    const deps = createDeps(clipboard);

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({ empty: true, reason: "presse-papiers non textuel" });
    expect(deps.sentKeystrokes).toEqual([]);
    expect(clipboard.writes).toEqual([]);
    expect(clipboard.availableFormats()).toEqual(["public.png"]);
  });

  it("restaure le presse-papiers même quand la frappe échoue", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("contenu original");
    const deps = createDeps(clipboard);
    deps.sendKeystroke = () => Promise.reject(new Error("osascript KO"));

    await expect(captureSelection(deps)).rejects.toThrow("osascript KO");
    expect(clipboard.currentText).toBe("contenu original");
  });

  it("la sentinelle est encadrée de NUL pour ne jamais entrer en collision", () => {
    expect(SENTINEL).toBe("\u0000reqraft-desktop-sentinel\u0000");
  });
});

describe("replaceSelection (DESKTOP.md §5.2)", () => {
  it("écrit, réactive, confirme, colle, puis restaure", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("presse-papiers utilisateur");
    const deps = createDeps(clipboard);
    const order: string[] = [];
    deps.sendKeystroke = (letter) => {
      order.push(`keystroke:${letter}`);
      return Promise.resolve();
    };
    deps.activateApp = (name) => {
      order.push(`activate:${name}`);
      expect(clipboard.currentText).toBe("résultat reformulé");
      return Promise.resolve(true);
    };

    const outcome = await replaceSelection("résultat reformulé", "TextEdit", deps);

    expect(outcome).toEqual({ applied: true });
    expect(order).toEqual(["activate:TextEdit", "keystroke:v"]);
    expect(clipboard.currentText).toBe("presse-papiers utilisateur");
  });

  it("ne colle jamais sans confirmation du basculement", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("presse-papiers utilisateur");
    const deps = createDeps(clipboard);
    deps.activateApp = () => Promise.resolve(false);

    const outcome = await replaceSelection("résultat", "AppInjouable", deps);

    expect(outcome).toEqual({ applied: false, reason: "application source non réactivée" });
    expect(deps.sentKeystrokes).toEqual([]);
    // Fallback gracieux : le texte reste disponible pour un collage manuel.
    expect(clipboard.currentText).toBe("résultat");
  });
});

describe("CaptureService", () => {
  function createBridge(clipboard: FakeClipboard): MacosBridge {
    return {
      frontmostApp: () => Promise.resolve("TextEdit"),
      activateApp: () => Promise.resolve(true),
      sendKeystroke: (letter) => {
        if (letter === "c") {
          clipboard.appCopy("sélection");
        }
        return Promise.resolve();
      },
      hasAutomation: () => Promise.resolve(true),
    };
  }

  it("trigger mémorise l'app source AVANT la capture, puis conserve le résultat", async () => {
    const clipboard = new FakeClipboard();
    const service = new CaptureService({ bridge: createBridge(clipboard), clipboard });

    const stashed = await service.trigger();

    expect(stashed).toEqual({ text: "sélection", sourceApp: "TextEdit" });
    expect(service.consumeStashed()).toEqual({ text: "sélection", sourceApp: "TextEdit" });
    expect(service.sourceApp).toBe("TextEdit");
  });

  it("sans trigger, consumeStashed annonce une capsule en saisie libre", () => {
    const service = new CaptureService({
      bridge: createBridge(new FakeClipboard()),
      clipboard: new FakeClipboard(),
    });

    expect(service.consumeStashed()).toEqual({ empty: true });
  });

  it("replace refuse quand l'app source est inconnue", async () => {
    const clipboard = new FakeClipboard();
    const bridge = createBridge(clipboard);
    bridge.frontmostApp = () => Promise.reject(new Error("automation refusée"));
    const service = new CaptureService({ bridge, clipboard });

    const outcome = await service.replace("résultat");

    expect(outcome).toEqual({ applied: false, reason: "application source inconnue" });
  });

  it("replace réinjecte dans l'app mémorisée, pas dans l'app au premier plan", async () => {
    const clipboard = new FakeClipboard();
    const bridge = createBridge(clipboard);
    const activated: string[] = [];
    bridge.activateApp = (name) => {
      activated.push(name);
      return Promise.resolve(true);
    };
    const service = new CaptureService({ bridge, clipboard });
    await service.trigger();

    const outcome = await service.replace("résultat");

    expect(outcome.applied).toBe(true);
    expect(activated).toEqual(["TextEdit"]);
  });
});
