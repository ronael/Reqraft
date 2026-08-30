import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

const READY_PREFIX = "REQRAFT_DESKTOP_E2E_READY ";
const APP_EXECUTABLE = path.resolve(
  "release/desktop/package/mac-arm64/Reqraft.app/Contents/MacOS/Reqraft",
);
const TIMEOUT_MS = 30_000;

interface ReadinessPayload {
  ready: boolean;
  appName: string;
  windows: { surface: string; destroyed: boolean }[];
  shortcuts: { registered: { intent: string }[] };
}

type DesktopProcess = ChildProcessByStdio<null, Readable, Readable>;

function spawnPackagedApp(home: string): DesktopProcess {
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    REQRAFT_DESKTOP_E2E_PROBE: "1",
  };
  return spawn(APP_EXECUTABLE, [`--user-data-dir=${path.join(home, "electron")}`], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForReadiness(child: DesktopProcess): Promise<ReadinessPayload> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Packaged desktop timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith(READY_PREFIX));
      if (line === undefined) return;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(line.slice(READY_PREFIX.length)) as ReadinessPayload);
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    child.once("error", (cause) => {
      clearTimeout(timeout);
      reject(cause);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Packaged desktop exited before readiness (${String(code ?? signal)}).\n${stderr}`,
        ),
      );
    });
  });
}

function waitForExit(child: DesktopProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return child.exitCode === 0
      ? Promise.resolve()
      : Promise.reject(
          new Error(`Packaged desktop exited with ${String(child.exitCode ?? child.signalCode)}.`),
        );
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Packaged desktop did not exit after reporting readiness."));
    }, TIMEOUT_MS);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Packaged desktop exited with ${String(code ?? signal)}.`));
      }
    });
  });
}

async function terminate(child: DesktopProcess): Promise<void> {
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

function validate(payload: ReadinessPayload): void {
  if (!payload.ready) throw new Error("Packaged desktop did not report ready.");
  if (payload.appName !== "Reqraft") {
    throw new Error(`Unexpected packaged app name: ${payload.appName}`);
  }
  for (const surface of ["capsule", "popover"]) {
    const window = payload.windows.find((candidate) => candidate.surface === surface);
    if (window === undefined || window.destroyed) {
      throw new Error(`Packaged desktop is missing its ${surface} window.`);
    }
  }
  const intents = new Set(payload.shortcuts.registered.map(({ intent }) => intent));
  if (!intents.has("capture") || !intents.has("input")) {
    throw new Error("Packaged desktop did not register both global shortcut intents.");
  }
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("The packaged desktop smoke test currently supports macOS only.");
  }
  if (!existsSync(APP_EXECUTABLE)) {
    throw new Error(`Packaged app not found at ${APP_EXECUTABLE}`);
  }

  const home = await mkdtemp(path.join(tmpdir(), "reqraft-packaged-smoke-"));
  const child = spawnPackagedApp(home);
  try {
    const payload = await waitForReadiness(child);
    validate(payload);
    await waitForExit(child);
    console.log("Packaged desktop smoke passed (Reqraft, capsule, popover, shortcuts).");
  } finally {
    await terminate(child);
    await rm(home, { recursive: true, force: true });
  }
}

void main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
});
