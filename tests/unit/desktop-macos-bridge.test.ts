import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createMacosBridge,
  createOsascriptRunner,
  keystrokeScript,
  parseSelection,
  READ_SELECTION_SCRIPT,
  type OsascriptRunner,
} from "@/apps/desktop/main/macos.js";

describe("pont macOS", () => {
  it("lit la sélection en JavaScript for Automation, par l'API d'accessibilité", async () => {
    const run = vi.fn<OsascriptRunner>(() =>
      Promise.resolve(JSON.stringify({ text: "  ligne 1\nligne 2 " })),
    );
    const bridge = createMacosBridge(run);

    await expect(bridge.readSelection()).resolves.toBe("  ligne 1\nligne 2 ");
    expect(run).toHaveBeenCalledWith(READ_SELECTION_SCRIPT, {
      language: "JavaScript",
      timeoutMs: 1500,
    });
    // Les noms d'attributs passent en NSString : en chaîne JS, l'API les refuse.
    expect(READ_SELECTION_SCRIPT).toContain('$("AXSelectedText")');
    expect(READ_SELECTION_SCRIPT).toContain("AXUIElementSetMessagingTimeout");
  });

  it.each([
    ["l'application n'expose rien", JSON.stringify({ text: null })],
    ["la sortie est illisible", "execution error"],
    ["la sortie n'est pas un objet", "42"],
  ])("rend null quand %s", async (_label, output) => {
    const bridge = createMacosBridge(() => Promise.resolve(output));

    await expect(bridge.readSelection()).resolves.toBeNull();
  });

  it("rend null au lieu de rejeter quand osascript échoue", async () => {
    // Sans Accessibilité, la lecture échoue ; la copie simulée prend le relais
    // et c'est elle qui nomme la permission manquante.
    const bridge = createMacosBridge(() => Promise.reject(new Error("-25211")));

    await expect(bridge.readSelection()).resolves.toBeNull();
  });

  it.each(["c", "v"] as const)(
    "attend le relâchement des touches avant de taper ⌘%s",
    async (letter) => {
      const run = vi.fn<OsascriptRunner>(() => Promise.resolve(""));
      const bridge = createMacosBridge(run);

      await bridge.sendKeystroke(letter);

      expect(run).toHaveBeenCalledWith(keystrokeScript(letter), { language: "JavaScript" });
      const script = keystrokeScript(letter);
      expect(script).toContain("CGEventSourceFlagsState(1) & held");
      // Shift, Control, Option et Commande : les bits 17 à 20.
      expect(script).toContain("0x1e0000");
      expect(script).toContain(`keystroke("${letter}", { using: "command down" })`);
    },
  );

  it("passe le langage du script à osascript", async () => {
    const exec = vi.fn(
      (
        _file: string,
        _args: readonly string[],
        _options: object,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, '{"text":"x"}\n', "");
        return undefined;
      },
    );
    const run = createOsascriptRunner(exec as never);

    await expect(run("1", { language: "JavaScript", timeoutMs: 42 })).resolves.toBe('{"text":"x"}');
    await run("return 1");

    expect(exec.mock.calls[0]?.slice(0, 3)).toEqual([
      "osascript",
      ["-l", "JavaScript", "-e", "1"],
      { timeout: 42 },
    ]);
    expect(exec.mock.calls[1]?.slice(0, 3)).toEqual([
      "osascript",
      ["-l", "AppleScript", "-e", "return 1"],
      { timeout: 3000 },
    ]);
  });

  it("parseSelection ne prend qu'une chaîne", () => {
    expect(parseSelection('{"text":""}')).toBe("");
    expect(parseSelection('{"text":12}')).toBeNull();
    expect(parseSelection("null")).toBeNull();
  });
});

describe.runIf(process.platform === "darwin")("scripts macOS réels", () => {
  it.each([
    ["la lecture de la sélection", READ_SELECTION_SCRIPT],
    ["⌘C", keystrokeScript("c")],
    ["⌘V", keystrokeScript("v")],
  ])("le script de %s compile tel qu'il part à osascript", (_label, script) => {
    // Une faute de syntaxe ne se verrait qu'au premier raccourci d'un
    // utilisateur : osacompile la voit avant.
    const folder = mkdtempSync(join(tmpdir(), "reqraft-osa-"));
    try {
      const compile = (): void => {
        execFileSync("/usr/bin/osacompile", [
          "-l",
          "JavaScript",
          "-e",
          script,
          "-o",
          join(folder, "s.scpt"),
        ]);
      };
      expect(compile).not.toThrow();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("la lecture rend du JSON même sans permission d'Accessibilité", () => {
    const output = execFileSync("/usr/bin/osascript", [
      "-l",
      "JavaScript",
      "-e",
      READ_SELECTION_SCRIPT,
    ])
      .toString()
      .trim();

    // Sans Accessibilité : null. Avec : la sélection du premier plan, peut-être vide.
    const value: unknown = JSON.parse(output);
    expect(value).toHaveProperty("text");
  });
});
