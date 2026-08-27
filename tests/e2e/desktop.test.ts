import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
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
const canRunElectron =
  process.env.REQRAFT_DESKTOP_E2E_FORCE === "1" ||
  (!isCodexSeatbelt && (process.platform !== "linux" || hasLinuxDisplay));
const describeElectron = canRunElectron ? describe : describe.skip;

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

async function runDesktopProbe(extraEnv: NodeJS.ProcessEnv = {}): Promise<DesktopE2ePayload> {
  expect(existsSync(mainEntry), `${mainEntry} is missing; run pnpm build:desktop first`).toBe(true);

  const home = await createIsolatedHome();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    REQRAFT_DESKTOP_E2E_PROBE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  return await new Promise((resolve, reject) => {
    const child = spawn(
      electronPath,
      [mainEntry, `--user-data-dir=${path.join(home, "electron")}`],
      {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`desktop probe timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      const line = stdout
        .split(/\r?\n/)
        .find((candidate) => candidate.startsWith("REQRAFT_DESKTOP_E2E_READY "));
      if (line === undefined) {
        const status = code === null ? (signal ?? "unknown") : String(code);
        reject(
          new Error(
            `desktop probe exited without readiness line (${status})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
        return;
      }
      resolve(JSON.parse(line.slice("REQRAFT_DESKTOP_E2E_READY ".length)) as DesktopE2ePayload);
    });
  });
}

describeElectron("desktop Electron smoke", () => {
  it("starts the built desktop bundle and creates the durable hidden windows", async () => {
    const payload = await runDesktopProbe();

    expect(payload.ready).toBe(true);
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
  });

  it("surfaces rejected global shortcuts without crashing startup", async () => {
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
  });
});
