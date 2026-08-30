import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type { ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const electronPath =
  process.platform === "win32"
    ? path.resolve("node_modules/.bin/electron.cmd")
    : path.resolve("node_modules/.bin/electron");
const mainEntry = path.resolve("release/desktop/bundle/main/index.mjs");
const isCodexSeatbelt = process.env.CODEX_SANDBOX === "seatbelt";
const hasLinuxDisplay =
  process.env.DISPLAY !== undefined || process.env.WAYLAND_DISPLAY !== undefined;
const forceElectron = process.env.REQRAFT_DESKTOP_E2E_FORCE === "1";
function canRunElectronSuite(): boolean {
  if (!forceElectron && process.env.npm_lifecycle_event !== "test:desktop:e2e") return false;
  if (isCodexSeatbelt && !forceElectron) return false;
  if (process.platform === "linux" && !hasLinuxDisplay) return false;
  return true;
}
const canRunElectron = canRunElectronSuite();
const describeElectron = canRunElectron ? describe : describe.skip;
const ELECTRON_TEST_TIMEOUT_MS = 45_000;

interface DesktopE2ePayload {
  ready: boolean;
  platform: NodeJS.Platform;
  appName: string;
  version: string;
  windowCount: number;
  windows: { surface: string; destroyed: boolean; visible: boolean }[];
  shortcuts: {
    registered: { accelerator: string; label: string; intent: "capture" | "input" }[];
    rejected: string[];
  };
  permissions: {
    accessibility: boolean;
    automation: boolean;
    canReplace: boolean;
    gap: string;
    message: string;
  };
  scenario?: {
    name: string;
    capsuleVisible?: boolean;
    capsuleMode?: string;
    run?: { rewritten: string; model: string; profile: string };
    error?: string;
  };
}

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryHomes.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createIsolatedHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "reqraft-desktop-e2e-"));
  temporaryHomes.push(directory);
  return directory;
}

/**
 * Une configuration écrite avant le démarrage.
 *
 * Sans elle, l'application considère l'installation à faire et ouvre
 * l'onboarding : aucun run ne peut partir. Le fournisseur `mock` ne demande ni
 * clé ni réseau, ce qui rend le scénario reproductible partout.
 */
async function writeConfig(home: string, config: Record<string, unknown>): Promise<void> {
  // La même règle que `src/config/paths.ts`, à la main : la calculer ici avec
  // le `os.homedir()` du processus de test donnerait le dossier de la vraie
  // installation, pas celui du HOME isolé passé à l'enfant.
  const directory =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "rp")
      : path.join(home, ".config", "rp");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "config.json"), JSON.stringify(config), "utf8");
}

/**
 * Lance le bundle desktop réel dans un HOME isolé.
 *
 * Deux isolations, pas une : `HOME` déplace la configuration, et
 * `--user-data-dir` déplace le verrou d'instance unique — que `userData` ne
 * suit pas sur macOS. Sans le second, la nouvelle instance partage le verrou,
 * quitte en silence avec le code 0, et le test croit à un crash muet.
 */
function spawnDesktop(
  home: string,
  userDataDir: string,
  extraEnv: NodeJS.ProcessEnv,
): ChildProcessByStdio<null, Readable, Readable> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
  };
  delete env.ELECTRON_RUN_AS_NODE;

  return spawn(electronPath, [mainEntry, `--user-data-dir=${userDataDir}`], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForReadiness(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs = 40_000,
): Promise<DesktopE2ePayload> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      action();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => {
        reject(new Error(`desktop probe timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout
        .split(/\r?\n/)
        .find((candidate) => candidate.startsWith("REQRAFT_DESKTOP_E2E_READY "));
      if (line !== undefined) {
        finish(() => {
          resolve(JSON.parse(line.slice("REQRAFT_DESKTOP_E2E_READY ".length)) as DesktopE2ePayload);
        });
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish(() => {
        reject(error);
      });
    });
    child.on("exit", (code, signal) => {
      finish(() => {
        const status = code === null ? (signal ?? "unknown") : String(code);
        reject(
          new Error(
            `desktop probe exited without readiness line (${status})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    });
  });
}

function waitForExit(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs = 15_000,
): Promise<{ code: number | null; stdout: string }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, stdout: "" });
  }
  return new Promise((resolve, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("desktop process did not exit"));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout });
    });
  });
}

async function terminate(child: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function runDesktopProbe(
  extraEnv: NodeJS.ProcessEnv = {},
  config?: Record<string, unknown>,
): Promise<DesktopE2ePayload> {
  expect(existsSync(mainEntry), `${mainEntry} is missing; run pnpm build:desktop first`).toBe(true);

  const home = await createIsolatedHome();
  if (config !== undefined) {
    await writeConfig(home, config);
  }

  const child = spawnDesktop(home, path.join(home, "electron"), {
    ...extraEnv,
    REQRAFT_DESKTOP_E2E_PROBE: "1",
  });
  const payload = await waitForReadiness(child);
  await waitForExit(child);
  return payload;
}

describeElectron("desktop Electron smoke", () => {
  it(
    "starts the built desktop bundle and creates the durable hidden windows",
    async () => {
      const payload = await runDesktopProbe();

      expect(payload.ready).toBe(true);
      expect(payload.appName).toBe("Reqraft");
      expect(payload.windowCount).toBeGreaterThanOrEqual(2);
      expect(payload.windows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ surface: "capsule", destroyed: false, visible: false }),
          expect.objectContaining({ surface: "popover", destroyed: false }),
        ]),
      );
      expect(
        payload.shortcuts.registered
          .map((shortcut) => shortcut.intent)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual(["capture", "input"]);
      expect(payload.permissions.message.length).toBeGreaterThan(0);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "opens the capsule through the input shortcut handler",
    async () => {
      // Le handler utilisé par le raccourci global est exercé dans le vrai bundle,
      // mais sans envoyer de frappe ni modifier le presse-papiers de la machine.
      const payload = await runDesktopProbe({ REQRAFT_DESKTOP_E2E_SCENARIO: "capsule" });

      expect(payload.scenario?.error).toBeUndefined();
      expect(payload.scenario?.capsuleVisible).toBe(true);
      expect(payload.scenario?.capsuleMode).toBe("input");
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "runs a full reprompt through the real main-process service",
    async () => {
      const payload = await runDesktopProbe(
        { REQRAFT_DESKTOP_E2E_SCENARIO: "run" },
        {
          defaultProvider: "mock",
          defaultModel: "mock-model",
          defaultProfile: "writing",
          defaultLevel: "standard",
          telemetry: false,
        },
      );

      expect(payload.scenario?.error).toBeUndefined();
      expect(payload.scenario?.run?.rewritten).toContain("[mock]");
      expect(payload.scenario?.run?.model).toBe("mock-model");
      expect(payload.scenario?.run?.profile).toBe("writing");
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "reports which macOS permission is missing instead of a bare boolean",
    async () => {
      // §5.9 : Accessibilité et Automatisation se demandent séparément, et le
      // message doit dire laquelle manque — sinon on envoie l'utilisateur dans
      // le mauvais panneau des Réglages Système.
      const payload = await runDesktopProbe();

      expect(["none", "accessibility", "automation", "both", "wayland"]).toContain(
        payload.permissions.gap,
      );
      if (payload.permissions.canReplace) {
        expect(payload.permissions.gap).toBe("none");
      } else {
        expect(payload.permissions.message).toMatch(/Accessibility|Automation|Wayland/);
      }
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it("refuses to start a second instance instead of fighting for the shortcut", async () => {
    // §5.8 : deux instances se disputeraient le raccourci global, et la
    // seconde enregistrée gagnerait sans que rien ne le dise. Le verrou doit
    // donc faire quitter la seconde — le même verrou dont dépend l'isolation
    // des instances de test, qui échoue en silence avec le code 0 quand on
    // oublie `--user-data-dir`.
    const home = await createIsolatedHome();
    const userDataDir = path.join(home, "electron");
    const first = spawnDesktop(home, userDataDir, {
      REQRAFT_DESKTOP_E2E_PROBE: "1",
      REQRAFT_DESKTOP_E2E_HOLD: "1",
    });
    try {
      // La disponibilité prouve que la première a pris le verrou et terminé son
      // démarrage. Aucun délai lié à la vitesse de la machine.
      await waitForReadiness(first);
      expect(first.exitCode, "la première instance ne doit pas avoir quitté").toBeNull();

      const second = spawnDesktop(home, userDataDir, { REQRAFT_DESKTOP_E2E_PROBE: "1" });
      const outcome = await waitForExit(second);

      expect(outcome.code).toBe(0);
      // Elle quitte avant `bootstrap` : aucune ligne de disponibilité, donc
      // aucune fenêtre ni raccourci enregistré.
      expect(outcome.stdout).not.toContain("REQRAFT_DESKTOP_E2E_READY");
    } finally {
      await terminate(first);
    }
  }, 60_000);

  it(
    "surfaces rejected global shortcuts without crashing startup",
    async () => {
      const payload = await runDesktopProbe({ REQRAFT_DESKTOP_E2E_REJECT_SHORTCUTS: "1" });

      expect(payload.ready).toBe(true);
      expect(payload.shortcuts.registered).toEqual([]);
      expect(payload.shortcuts.rejected).toEqual([
        "Command+Control+R",
        "Command+Control+N",
        "Command+Control+J",
        "Command+Control+K",
      ]);
      expect(payload.windowCount).toBeGreaterThanOrEqual(2);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );
});
