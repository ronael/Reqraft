import { describe, expect, it } from "vitest";
import {
  CAPTURE_SENTINEL_FOR_TESTS,
  captureSelection,
  replaceSelection,
  type CaptureClipboard,
  type CaptureDependencies,
  type ClipboardSnapshot,
} from "@/apps/desktop/main/capture.js";
import { CaptureService } from "@/apps/desktop/main/capture-service.js";
import type { DesktopNativeBridge } from "@/apps/desktop/main/native-bridge.js";

const SENTINEL = CAPTURE_SENTINEL_FOR_TESTS;
const PLAIN_TEXT = "public.utf8-plain-text";

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
    this.formats = [PLAIN_TEXT];
  }

  availableFormats(): string[] {
    return this.formats;
  }

  snapshot(): ClipboardSnapshot {
    const content = this.content;
    const formats = [...this.formats];
    return {
      text: content,
      restore: () => {
        this.content = content;
        this.formats = formats;
      },
    };
  }

  seedImage(): void {
    this.content = "";
    this.formats = ["public.png"];
  }

  /** Rich text, as Word or a web page copies it: plain text plus HTML. */
  seedRichText(text: string): void {
    this.content = text;
    this.formats = [PLAIN_TEXT, "public.html"];
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

  it("distingue « aucune sélection » grâce à la sentinelle, et propose le texte copié", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("contenu original");
    const deps = createDeps(clipboard);

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({
      empty: true,
      reason: "no selection",
      clipboardText: "contenu original",
    });
    expect(clipboard.currentText).toBe("contenu original");
  });

  it("ne propose rien quand le presse-papiers n'a pas de texte", async () => {
    const clipboard = new FakeClipboard();
    const deps = createDeps(clipboard);

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({ empty: true, reason: "no selection" });
  });

  it("refuse un presse-papiers non textuel sans y toucher", async () => {
    const clipboard = new FakeClipboard();
    clipboard.seedImage();
    const deps = createDeps(clipboard);

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({ empty: true, reason: "clipboard is not text" });
    expect(deps.sentKeystrokes).toEqual([]);
    expect(clipboard.writes).toEqual([]);
    expect(clipboard.availableFormats()).toEqual(["public.png"]);
  });

  it("rend un presse-papiers riche avec tous ses formats, pas en texte brut", async () => {
    // Seul le texte était sauvegardé : chaque copie de secours transformait un
    // texte mis en forme, copié depuis Word ou une page web, en texte brut.
    const clipboard = new FakeClipboard();
    clipboard.seedRichText("titre en gras");
    const deps = createDeps(clipboard);
    deps.sendKeystroke = () => {
      clipboard.appCopy("sélection");
      return Promise.resolve();
    };

    await captureSelection(deps);

    expect(clipboard.currentText).toBe("titre en gras");
    expect(clipboard.availableFormats()).toEqual([PLAIN_TEXT, "public.html"]);
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
    expect(outcome).toMatchObject({ empty: true, clipboardText: "contenu original" });
    expect("reason" in outcome ? outcome.reason : "").toContain("osascript KO");
    expect(clipboard.currentText).toBe("contenu original");
  });

  it("la sentinelle est encadrée de NUL pour ne jamais entrer en collision", () => {
    expect(SENTINEL).toBe("\u0000reqraft-desktop-sentinel\u0000");
  });
});

describe("lecture directe de la sélection, la copie en secours", () => {
  it("lit la sélection par l'accessibilité sans toucher au presse-papiers", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("contenu original");
    clipboard.writes.length = 0;
    const deps = createDeps(clipboard);
    deps.readSelection = () => Promise.resolve("  texte lu tel quel\n");

    const outcome = await captureSelection(deps);

    // Les espaces et le retour final font partie de la sélection : le
    // remplacement doit les rendre, donc la capture ne les retire pas.
    expect(outcome).toEqual({ text: "  texte lu tel quel\n" });
    expect(deps.sentKeystrokes).toEqual([]);
    expect(clipboard.writes).toEqual([]);
  });

  it.each([
    ["ne répond pas", () => Promise.resolve(null)],
    ["répond vide", () => Promise.resolve("")],
    ["répond des blancs", () => Promise.resolve(" \n ")],
    ["échoue", () => Promise.reject(new Error("AX indisponible"))],
  ] as const)("copie quand l'accessibilité %s", async (_label, readSelection) => {
    // Certaines applications annoncent une sélection vide alors que du texte
    // est sélectionné : seule la copie tranche.
    const clipboard = new FakeClipboard();
    const deps = createDeps(clipboard);
    deps.readSelection = readSelection;
    deps.sendKeystroke = (letter) => {
      deps.sentKeystrokes.push(letter);
      clipboard.appCopy("sélection copiée");
      return Promise.resolve();
    };

    const outcome = await captureSelection(deps);

    expect(outcome).toEqual({ text: "sélection copiée" });
    expect(deps.sentKeystrokes).toEqual(["c"]);
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

  it("rend aussi les formats riches après le collage", async () => {
    const clipboard = new FakeClipboard();
    clipboard.seedRichText("texte mis en forme");
    const deps = createDeps(clipboard);

    await replaceSelection("résultat", "TextEdit", deps);

    expect(clipboard.currentText).toBe("texte mis en forme");
    expect(clipboard.availableFormats()).toEqual([PLAIN_TEXT, "public.html"]);
  });

  it("laisse la fenêtre devenir active avant de frapper", async () => {
    // `activateApp` confirme que le processus est au premier plan, pas que sa
    // fenêtre accepte les frappes. ⌘V envoyé dans la foulée atterrissait dans
    // la fenêtre précédente — la capsule — et la sélection restait intacte,
    // pendant que le remplacement se déclarait réussi.
    const clipboard = new FakeClipboard();
    clipboard.writeText("presse-papiers utilisateur");
    const deps = createDeps(clipboard);
    const order: string[] = [];
    deps.activateApp = () => {
      order.push("activate");
      return Promise.resolve(true);
    };
    deps.wait = (ms) => {
      order.push(`wait:${String(ms)}`);
      return Promise.resolve();
    };
    deps.sendKeystroke = () => {
      order.push("keystroke");
      return Promise.resolve();
    };
    deps.activateSettleMs = 7;

    await replaceSelection("résultat", "TextEdit", deps);

    expect(order.slice(0, 3)).toEqual(["activate", "wait:7", "keystroke"]);
  });

  it("ne reprend pas un presse-papiers que l'utilisateur a changé entre-temps", async () => {
    // Le presse-papiers est rendu après le collage. Si quelqu'un a copié autre
    // chose pendant ce battement, le lui écraser lui prend son contenu.
    const clipboard = new FakeClipboard();
    clipboard.writeText("presse-papiers utilisateur");
    const deps = createDeps(clipboard);
    deps.sendKeystroke = () => {
      clipboard.writeText("copié pendant le collage");
      return Promise.resolve();
    };

    const outcome = await replaceSelection("résultat", "TextEdit", deps);

    expect(outcome).toEqual({ applied: true });
    expect(clipboard.currentText).toBe("copié pendant le collage");
  });

  it("ne colle jamais sans confirmation du basculement", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("presse-papiers utilisateur");
    const deps = createDeps(clipboard);
    deps.activateApp = () => Promise.resolve(false);

    const outcome = await replaceSelection("résultat", "AppInjouable", deps);

    expect(outcome).toEqual({
      applied: false,
      reason: "source app did not come back to the front",
    });
    expect(deps.sentKeystrokes).toEqual([]);
    // Fallback gracieux : le texte reste disponible pour un collage manuel.
    expect(clipboard.currentText).toBe("résultat");
  });
});

describe("CaptureService", () => {
  function createBridge(clipboard: FakeClipboard): DesktopNativeBridge {
    return {
      frontmostApp: () => Promise.resolve("TextEdit"),
      activateApp: () => Promise.resolve(true),
      readSelection: () => Promise.resolve(null),
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

  it("passe par la lecture directe du pont natif avant toute copie", async () => {
    const clipboard = new FakeClipboard();
    const bridge = createBridge(clipboard);
    const keystrokes: string[] = [];
    bridge.readSelection = () => Promise.resolve("lu par l'accessibilité");
    bridge.sendKeystroke = (letter) => {
      keystrokes.push(letter);
      return Promise.resolve();
    };
    const service = new CaptureService({ bridge, clipboard });

    await expect(service.trigger()).resolves.toEqual({
      text: "lu par l'accessibilité",
      sourceApp: "TextEdit",
    });
    expect(keystrokes).toEqual([]);
  });

  it("garde le texte capturé quand l'app source n'a pas pu être identifiée", async () => {
    // Le texte était jeté sans un mot : la capsule s'ouvrait vide alors que la
    // sélection avait bien été lue.
    const clipboard = new FakeClipboard();
    const bridge = createBridge(clipboard);
    bridge.frontmostApp = () => Promise.reject(new Error("délai dépassé"));
    const service = new CaptureService({ bridge, clipboard });

    await expect(service.trigger()).resolves.toEqual({ text: "sélection", sourceApp: null });
  });

  it("deux appuis rapprochés ne lancent qu'une capture", async () => {
    // Deux captures simultanées sauvegardaient et restauraient le presse-papiers
    // l'une par-dessus l'autre : il pouvait finir par contenir la sentinelle.
    const clipboard = new FakeClipboard();
    clipboard.writeText("contenu utilisateur");
    const bridge = createBridge(clipboard);
    let copies = 0;
    bridge.sendKeystroke = (letter) => {
      if (letter === "c") {
        copies += 1;
        clipboard.appCopy("sélection");
      }
      return Promise.resolve();
    };
    const service = new CaptureService({ bridge, clipboard });

    const [first, second] = await Promise.all([service.trigger(), service.trigger()]);

    expect(copies).toBe(1);
    expect(first).toEqual(second);
    expect(clipboard.currentText).toBe("contenu utilisateur");

    await service.trigger();
    expect(copies).toBe(2);
  });

  it("garde le texte copié à proposer quand rien n'est sélectionné", async () => {
    const clipboard = new FakeClipboard();
    clipboard.writeText("texte copié plus tôt");
    const bridge = createBridge(clipboard);
    bridge.sendKeystroke = () => Promise.resolve();
    const service = new CaptureService({ bridge, clipboard });

    await expect(service.trigger()).resolves.toEqual({
      empty: true,
      reason: "no selection",
      clipboardText: "texte copié plus tôt",
    });
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

    expect(outcome).toEqual({ applied: false, reason: "source app unknown" });
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

  it("un remplacement qui échoue rend la main au lieu de rejeter", async () => {
    // Une application quittée entre-temps, une permission retirée : le rejet
    // laissait la capsule cachée, avec le résultat et le message dedans.
    const clipboard = new FakeClipboard();
    const bridge = createBridge(clipboard);
    const service = new CaptureService({ bridge, clipboard });
    await service.trigger();
    bridge.activateApp = () => Promise.reject(new Error("TextEdit n'existe plus"));

    const outcome = await service.replace("résultat");

    expect(outcome).toEqual({
      applied: false,
      reason: "replacement failed: TextEdit n'existe plus",
    });
    // Le résultat reste à coller à la main.
    expect(clipboard.currentText).toBe("résultat");
  });

  it("un remplacement refusé par macOS nomme le réglage à ouvrir", async () => {
    const clipboard = new FakeClipboard();
    const bridge = createBridge(clipboard);
    const service = new CaptureService({ bridge, clipboard });
    await service.trigger();
    bridge.sendKeystroke = () =>
      Promise.reject(new Error("osascript is not allowed to send keystrokes. (1002)"));

    const outcome = await service.replace("résultat");

    expect(outcome.applied).toBe(false);
    expect(outcome.reason).toContain("Accessibility");
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
    expect(reason).toContain("Accessibility");
    expect(reason).not.toContain("osascript");
  });

  it("propose le texte copié même quand la permission manque", async () => {
    // C'est le cas où le secours sert le plus : l'utilisateur copie à la main,
    // la capsule reprend ce texte.
    const clipboard = new FakeClipboard();
    clipboard.appCopy("contenu utilisateur");

    const outcome = await captureSelection({
      clipboard,
      sendKeystroke: () => Promise.reject(PERMISSION_ERROR),
      activateApp: () => Promise.resolve(true),
      wait: () => Promise.resolve(),
    });

    expect(outcome).toMatchObject({ clipboardText: "contenu utilisateur" });
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
    expect(reason).toContain("Automation");
    expect(reason).not.toContain("Accessibility");
  });

  it("le service garde la raison au lieu de la jeter", async () => {
    // Elle était perdue ici : `{ empty: true }` était reconstruit sans elle, et
    // la capsule s'ouvrait en saisie libre sans rien pouvoir expliquer.
    const service = new CaptureService({
      bridge: {
        frontmostApp: () => Promise.resolve("Safari"),
        activateApp: () => Promise.resolve(true),
        readSelection: () => Promise.resolve(null),
        sendKeystroke: () => Promise.reject(new Error("execution error: ... (-1743)")),
        hasAutomation: () => Promise.resolve(false),
      },
      clipboard: new FakeClipboard(),
    });

    const stashed = await service.trigger();

    expect("reason" in stashed ? stashed.reason : undefined).toContain("Automation");
  });
});
