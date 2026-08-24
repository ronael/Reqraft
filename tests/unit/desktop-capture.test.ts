import { describe, expect, it } from "vitest";
import {
  CAPTURE_SENTINEL_FOR_TESTS,
  captureSelection,
  replaceSelection,
  type CaptureClipboard,
  type CaptureDependencies,
} from "@/apps/desktop/main/capture.js";
import { CaptureService } from "@/apps/desktop/main/capture-service.js";
import type { MacosBridge } from "@/apps/desktop/main/macos.js";

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

    // Ne rejette plus : une capture impossible se rend comme une capture vide,
    // sinon le raccourci global n'ouvrait rien du tout. La raison est portée
    // par le résultat plutôt que par une exception.
    const outcome = await captureSelection(deps);
    expect(outcome).toMatchObject({ empty: true });
    expect("reason" in outcome ? outcome.reason : "").toContain("osascript KO");
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

describe("permission manquante : dégradation, jamais de rejet nu", () => {
  const PERMISSION_ERROR = new Error(
    "36:68: execution error: Erreur dans System Events : osascript n’est pas autorisé à envoyer de saisies. (1002)",
  );

  it("rend une capture vide au lieu de rejeter", async () => {
    // Sans ce catch, le raccourci global ne faisait rien : la promesse
    // remontait non gérée et la capsule ne s'ouvrait jamais.
    const clipboard = new FakeClipboard();
    clipboard.appCopy("contenu utilisateur");

    const outcome = await captureSelection({
      clipboard,
      sendKeystroke: () => Promise.reject(PERMISSION_ERROR),
      activateApp: () => Promise.resolve(true),
      wait: () => Promise.resolve(),
    });

    expect(outcome).toMatchObject({ empty: true });
  });

  it("nomme l'action à faire, pas le programme qui a échoué", async () => {
    const clipboard = new FakeClipboard();
    clipboard.appCopy("contenu utilisateur");

    const outcome = await captureSelection({
      clipboard,
      sendKeystroke: () => Promise.reject(PERMISSION_ERROR),
      activateApp: () => Promise.resolve(true),
      wait: () => Promise.resolve(),
    });

    const reason = "reason" in outcome ? outcome.reason : "";
    // « osascript » ne veut rien dire pour quelqu'un qui n'a jamais lancé ce
    // programme ; ce qu'il faut, c'est le chemin dans les réglages.
    expect(reason).toContain("Accessibilité");
    expect(reason).not.toContain("osascript");
  });

  it("rend le presse-papiers intact même quand la capture échoue", async () => {
    const clipboard = new FakeClipboard();
    clipboard.appCopy("contenu utilisateur");

    await captureSelection({
      clipboard,
      sendKeystroke: () => Promise.reject(PERMISSION_ERROR),
      activateApp: () => Promise.resolve(true),
      wait: () => Promise.resolve(),
    });

    expect(clipboard.readText()).toBe("contenu utilisateur");
  });

  it("rapporte une panne quelconque sans la masquer", async () => {
    const clipboard = new FakeClipboard();

    const outcome = await captureSelection({
      clipboard,
      sendKeystroke: () => Promise.reject(new Error("panne inattendue")),
      activateApp: () => Promise.resolve(true),
      wait: () => Promise.resolve(),
    });

    const reason = "reason" in outcome ? outcome.reason : "";
    expect(reason).toContain("panne inattendue");
  });
});

describe("la raison d'un échec remonte jusqu'à la capsule", () => {
  it("nomme l'Automatisation refusée, distincte de l'Accessibilité", async () => {
    // -1743 est « Not authorized to send Apple events to System Events ». Ce
    // sont deux réglages système différents, dans deux panneaux différents :
    // envoyer quelqu'un dans le mauvais ne mène nulle part.
    const deps = createDeps(new FakeClipboard());
    deps.sendKeystroke = () => Promise.reject(new Error("execution error: ... (-1743)"));

    const outcome = await captureSelection(deps);

    const reason = "reason" in outcome ? outcome.reason : "";
    expect(reason).toContain("Automatisation");
    expect(reason).not.toContain("Accessibilité");
  });

  it("le service garde la raison au lieu de la jeter", async () => {
    // Elle était perdue ici : `{ empty: true }` était reconstruit sans elle, et
    // la capsule s'ouvrait en saisie libre sans rien pouvoir expliquer.
    const service = new CaptureService({
      bridge: {
        frontmostApp: () => Promise.resolve("Safari"),
        activateApp: () => Promise.resolve(true),
        sendKeystroke: () => Promise.reject(new Error("execution error: ... (-1743)")),
        hasAutomation: () => Promise.resolve(false),
      },
      clipboard: new FakeClipboard(),
    });

    const stashed = await service.trigger();

    expect("reason" in stashed ? stashed.reason : undefined).toContain("Automatisation");
  });
});
