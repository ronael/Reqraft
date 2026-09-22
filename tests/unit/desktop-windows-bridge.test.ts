import { describe, expect, it, vi } from "vitest";
import {
  createPowershellRunner,
  createWindowsBridge,
  type PowershellRunner,
} from "@/apps/desktop/main/windows-bridge.js";

describe("Windows desktop bridge", () => {
  it("mémorise le PID exact de la fenêtre source et le réactive", async () => {
    const calls: { script: string; timeoutMs: number | undefined }[] = [];
    const run: PowershellRunner = (script, timeoutMs) => {
      calls.push({ script, timeoutMs });
      if (script.includes("ConvertTo-Json")) {
        return Promise.resolve('{"id":4242,"name":"notepad"}');
      }
      return Promise.resolve("true");
    };
    const bridge = createWindowsBridge(run);

    await expect(bridge.frontmostApp()).resolves.toBe("notepad");
    await expect(bridge.activateApp("notepad", 750)).resolves.toBe(true);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.script).toContain("AppActivate([int]4242)");
    expect(calls[1]?.script).toContain("-eq 4242");
    expect(calls[1]?.timeoutMs).toBe(1750);
  });

  it("ne tente pas d'activer une application que ce bridge n'a pas observée", async () => {
    const run = vi.fn<PowershellRunner>(() => Promise.resolve("true"));
    const bridge = createWindowsBridge(run);

    await expect(bridge.activateApp("notepad")).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("met à jour le PID si une nouvelle fenêtre du même processus est capturée", async () => {
    const outputs = ['{"id":10,"name":"Code"}', '{"id":99,"name":"Code"}', "true"];
    const scripts: string[] = [];
    const run: PowershellRunner = (script) => {
      scripts.push(script);
      return Promise.resolve(outputs.shift() ?? "");
    };
    const bridge = createWindowsBridge(run);

    await bridge.frontmostApp();
    await bridge.frontmostApp();
    await bridge.activateApp("Code");

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

  it("rejette une réponse de fenêtre native mal formée", async () => {
    const bridge = createWindowsBridge(() => Promise.resolve('{"id":0,"name":""}'));

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
