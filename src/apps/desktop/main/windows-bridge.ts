import { execFile } from "node:child_process";
import type { DesktopNativeBridge } from "./native-bridge.js";

/**
 * Windows selection bridge.
 *
 * Windows PowerShell is part of supported Windows installations, so this
 * adapter does not add a native Node dependency to the packaged application.
 * PowerShell only hosts the small .NET/Win32 calls; capture orchestration and
 * clipboard restoration remain in CaptureService like they do on macOS.
 */

export type PowershellRunner = (script: string, timeoutMs?: number) => Promise<string>;

interface WindowsTarget {
  id: number;
  name: string;
}

const FOREGROUND_WINDOW_API = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ReqraftForegroundWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
`;

const READ_FOREGROUND_TARGET = String.raw`
${FOREGROUND_WINDOW_API}
$window = [ReqraftForegroundWindow]::GetForegroundWindow()
if ($window -eq [IntPtr]::Zero) {
    throw 'Windows did not report a foreground window.'
}

[uint32]$processId = 0
[void][ReqraftForegroundWindow]::GetWindowThreadProcessId($window, [ref]$processId)
$process = Get-Process -Id $processId -ErrorAction Stop
[pscustomobject]@{
    id = [int]$process.Id
    name = [string]$process.ProcessName
} | ConvertTo-Json -Compress
`;

const CONTROL_KEY: Readonly<Record<"c" | "v", string>> = {
  c: "^c",
  v: "^v",
};

export function createPowershellRunner(exec: typeof execFile = execFile): PowershellRunner {
  return (script, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
      exec(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Sta", "-Command", script],
        { timeout: timeoutMs, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }
          resolve(stdout.trim());
        },
      );
    });
}

export function createWindowsBridge(run: PowershellRunner): DesktopNativeBridge {
  const rememberedTargets = new Map<string, WindowsTarget>();

  async function readForegroundTarget(): Promise<WindowsTarget> {
    const output = await run(READ_FOREGROUND_TARGET);
    return parseWindowsTarget(output);
  }

  async function frontmostApp(): Promise<string> {
    const target = await readForegroundTarget();
    rememberedTargets.set(target.name, target);
    return target.name;
  }

  async function activateApp(name: string, timeoutMs = 1500): Promise<boolean> {
    const target = rememberedTargets.get(name);
    if (target === undefined) return false;

    const script = activationScript(target.id, timeoutMs);
    return (await run(script, timeoutMs + 1000)).trim().toLowerCase() === "true";
  }

  async function sendKeystroke(letter: "c" | "v"): Promise<void> {
    const keys = CONTROL_KEY[letter];
    await run(String.raw`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${keys}')
`);
  }

  return {
    frontmostApp,
    activateApp,
    sendKeystroke,
    hasAutomation: () => Promise.resolve(true),
  };
}

function activationScript(processId: number, timeoutMs: number): string {
  return String.raw`
${FOREGROUND_WINDOW_API}
Add-Type -AssemblyName Microsoft.VisualBasic

try {
    [Microsoft.VisualBasic.Interaction]::AppActivate([int]${String(processId)})
} catch [System.ArgumentException] {
    Write-Output 'false'
    exit 0
}

$deadline = [DateTime]::UtcNow.AddMilliseconds(${String(timeoutMs)})
do {
    $window = [ReqraftForegroundWindow]::GetForegroundWindow()
    [uint32]$foregroundProcessId = 0
    [void][ReqraftForegroundWindow]::GetWindowThreadProcessId(
        $window,
        [ref]$foregroundProcessId
    )
    if ($foregroundProcessId -eq ${String(processId)}) {
        Write-Output 'true'
        exit 0
    }
    Start-Sleep -Milliseconds 20
} while ([DateTime]::UtcNow -lt $deadline)

Write-Output 'false'
`;
}

function parseWindowsTarget(output: string): WindowsTarget {
  const value: unknown = JSON.parse(output);
  if (!isWindowsTarget(value)) {
    throw new Error("Windows returned an invalid foreground-window response.");
  }
  return value;
}

function isWindowsTarget(value: unknown): value is WindowsTarget {
  if (typeof value !== "object" || value === null) return false;
  const target = value as Partial<WindowsTarget>;
  if (typeof target.id !== "number" || !Number.isInteger(target.id) || target.id <= 0) return false;
  return typeof target.name === "string" && target.name.length > 0;
}
