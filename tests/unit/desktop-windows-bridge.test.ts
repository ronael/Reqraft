import { describe, expect, it, vi } from "vitest";
import {
  createPowershellRunner,
  createWindowsBridge,
  READ_FOREGROUND_TARGET,
  type PowershellRunner,
} from "@/apps/desktop/main/windows-bridge.js";

function target(fields: { id: number; name: string; window?: number; selection?: string | null }) {
  return JSON.stringify({ window: 1234, selection: null, ...fields });
}

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

describe("Windows desktop bridge", () => {
  it("mémorise la fenêtre exacte de la source et la réactive", async () => {
    const calls: { script: string; timeoutMs: number | undefined }[] = [];
    const run: PowershellRunner = (script, timeoutMs) => {
      calls.push({ script, timeoutMs });
      if (script.includes("ConvertTo-Json")) {
        return Promise.resolve(target({ id: 4242, name: "notepad", window: 657432 }));
      }
      return Promise.resolve("true");
    };
    const bridge = createWindowsBridge(run);

    await expect(bridge.frontmostApp()).resolves.toBe("notepad");
    await expect(bridge.activateApp("notepad", 750)).resolves.toBe(true);

    expect(calls).toHaveLength(2);
    const activation = calls[1]?.script ?? "";
    // La fenêtre d'abord : un processus peut en avoir plusieurs, et ramener
    // « le processus » pouvait coller dans une autre.
    expect(activation).toContain("[IntPtr]::new([int64]657432)");
    expect(activation).toContain("SetForegroundWindow($target)");
    // Le processus seulement si la fenêtre a disparu.
    expect(activation).toContain("AppActivate([int]4242)");
    expect(activation).toContain("-eq 4242");
    // L'attente demandée, plus le démarrage de PowerShell et la compilation.
    expect(calls[1]?.timeoutMs).toBe(3750);
  });

  it("lit la fenêtre, la sélection et attend les touches en un seul PowerShell", async () => {
    const run = vi.fn<PowershellRunner>(() => Promise.resolve(target({ id: 7, name: "WINWORD" })));
    const bridge = createWindowsBridge(run);

    await bridge.frontmostApp();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(READ_FOREGROUND_TARGET, 5000);
    expect(READ_FOREGROUND_TARGET).toContain("GetAsyncKeyState($key) -band 0x8000");
    expect(READ_FOREGROUND_TARGET).toContain("TextPattern]::Pattern");
    expect(READ_FOREGROUND_TARGET).toContain("ToBase64String");
  });

  it("rend une fois la sélection lue par UI Automation, sans relancer PowerShell", async () => {
    const run = vi.fn<PowershellRunner>(() =>
      Promise.resolve(
        target({ id: 7, name: "WINWORD", selection: base64("Été — « citation »\n") }),
      ),
    );
    const bridge = createWindowsBridge(run);

    await bridge.frontmostApp();

    await expect(bridge.readSelection()).resolves.toBe("Été — « citation »\n");
    await expect(bridge.readSelection()).resolves.toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ne rend jamais la sélection d'une lecture précédente quand la suivante échoue", async () => {
    const outputs = [
      Promise.resolve(target({ id: 7, name: "WINWORD", selection: base64("ancienne") })),
      Promise.reject(new Error("délai dépassé")),
    ];
    const bridge = createWindowsBridge(() => outputs.shift() ?? Promise.resolve(""));

    await bridge.frontmostApp();
    await expect(bridge.frontmostApp()).rejects.toThrow("délai dépassé");

    await expect(bridge.readSelection()).resolves.toBeNull();
  });

  it("ne tente pas d'activer une application que ce bridge n'a pas observée", async () => {
    const run = vi.fn<PowershellRunner>(() => Promise.resolve("true"));
    const bridge = createWindowsBridge(run);

    await expect(bridge.activateApp("notepad")).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("met à jour la cible si une nouvelle fenêtre du même processus est capturée", async () => {
    const outputs = [
      target({ id: 10, name: "Code", window: 111 }),
      target({ id: 99, name: "Code", window: 222 }),
      "true",
    ];
    const scripts: string[] = [];
    const run: PowershellRunner = (script) => {
      scripts.push(script);
      return Promise.resolve(outputs.shift() ?? "");
    };
    const bridge = createWindowsBridge(run);

    await bridge.frontmostApp();
    await bridge.frontmostApp();
    await bridge.activateApp("Code");

    expect(scripts[2]).toContain("[IntPtr]::new([int64]222)");
    expect(scripts[2]).toContain("AppActivate([int]99)");
  });

  it.each([
    ["c", "^c"],
    ["v", "^v"],
  ] as const)("envoie Ctrl+%s à l'application active", async (letter, keys) => {
    const scripts: string[] = [];
    const bridge = createWindowsBridge((script) => {
      scripts.push(script);
      return Promise.resolve("");
    });

    await bridge.sendKeystroke(letter);

    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain(`SendWait('${keys}')`);
  });

  it.each([
    ["sans PID", '{"id":0,"name":"","window":1,"selection":null}'],
    ["sans fenêtre", '{"id":5,"name":"notepad","selection":null}'],
    [
      "avec une sélection qui n'est pas du texte",
      '{"id":5,"name":"notepad","window":1,"selection":3}',
    ],
  ])("rejette une réponse de fenêtre native %s", async (_label, output) => {
    const bridge = createWindowsBridge(() => Promise.resolve(output));

    await expect(bridge.frontmostApp()).rejects.toThrow(
      "Windows returned an invalid foreground-window response.",
    );
  });

  it("lance PowerShell caché, sans profil, et relaie sa sortie", async () => {
    const exec = vi.fn(
      (
        _file: string,
        _args: readonly string[],
        _options: object,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "  résultat  \r\n", "");
        return undefined;
      },
    );
    const run = createPowershellRunner(exec as never);

    await expect(run("Write-Output 'résultat'", 987)).resolves.toBe("résultat");

    expect(exec).toHaveBeenCalledWith(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Sta", "-Command", "Write-Output 'résultat'"],
      { timeout: 987, windowsHide: true },
      expect.any(Function),
    );
  });

  it("relaie stderr quand PowerShell échoue", async () => {
    const exec = vi.fn(
      (
        _file: string,
        _args: readonly string[],
        _options: object,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(new Error("spawn failed"), "", "échec natif\r\n");
        return undefined;
      },
    );
    const run = createPowershellRunner(exec as never);

    await expect(run("throw 'échec'")).rejects.toThrow("échec natif");
  });
});

describe.runIf(process.platform === "win32")("scripts PowerShell réels", () => {
  it("la lecture du premier plan compile et rend une cible, ou dit qu'il n'y en a pas", async () => {
    // Une erreur de C# ou de PowerShell ne se verrait qu'au premier raccourci
    // d'un utilisateur. Sur un poste de CI sans bureau actif, Windows peut ne
    // rapporter aucune fenêtre : le script le dit, et c'est la preuve qu'il a
    // tourné jusque-là.
    const bridge = createWindowsBridge(createPowershellRunner());

    const outcome = await bridge.frontmostApp().then(
      (name) => ({ name }),
      (error: unknown) => ({ error: String(error) }),
    );

    if ("name" in outcome) {
      expect(outcome.name.length).toBeGreaterThan(0);
    } else {
      expect(outcome.error).toMatch(/did not report a foreground window/);
    }
  }, 20_000);

  it("l'activation compile, et répond non pour une fenêtre et un processus absents", async () => {
    const run = createPowershellRunner();
    const absent = target({ id: 999_999, name: "absent", window: 1 });
    const bridge = createWindowsBridge((script, timeoutMs) =>
      script.includes("ConvertTo-Json") ? Promise.resolve(absent) : run(script, timeoutMs),
    );

    await bridge.frontmostApp();
    // Le script répond « false » dès qu'AppActivate échoue : ce délai ne sert
    // qu'à laisser démarrer PowerShell et compiler, plus d'une seconde sur un
    // poste de CI froid.
    await expect(bridge.activateApp("absent", 2000)).resolves.toBe(false);
  }, 20_000);
});
