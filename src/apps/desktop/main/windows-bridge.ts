import { execFile } from "node:child_process";
import type { DesktopNativeBridge } from "./native-bridge.js";

/**
 * Windows selection bridge.
 *
 * Windows PowerShell is part of supported Windows installations, so this
 * adapter does not add a native Node dependency to the packaged application.
 * PowerShell only hosts the small .NET/Win32 calls; capture orchestration and
 * clipboard restoration remain in CaptureService like they do on macOS.
 *
 * Every PowerShell start compiles the C# below again, about half a second.
 * The foreground read therefore does everything the trigger needs in one
 * start: wait for the shortcut's keys to be released, record the window, and
 * read the selection through UI Automation.
 */

export type PowershellRunner = (script: string, timeoutMs?: number) => Promise<string>;

interface WindowsTarget {
  id: number;
  name: string;
  /** The window handle: a process can own several windows. */
  window: number;
  /** UTF-8 selection in base64, or null when UI Automation exposed none. */
  selection: string | null;
}

/** Compile, key wait and UI Automation take about two seconds on a slow machine. */
const FOREGROUND_READ_TIMEOUT_MS = 5000;

/**
 * What an activation script needs before its own wait even starts: PowerShell
 * and the C# compile. A one-second margin was too short on a cold machine, and
 * the script was killed without a word; the paste then failed as if the source
 * window had not come back.
 */
const ACTIVATION_START_MS = 3000;

const FOREGROUND_WINDOW_API = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ReqraftForegroundWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int key);
}
'@
`;

export const READ_FOREGROUND_TARGET = String.raw`
${FOREGROUND_WINDOW_API}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

# The shortcut's keys may still be down. Wait (600 ms at most) until Shift,
# Ctrl, Alt and both Windows keys are up: the Ctrl+C that may follow would
# otherwise arrive as Ctrl+Alt+C, which types a character on many layouts.
$modifiers = 0x10, 0x11, 0x12, 0x5B, 0x5C
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $held = $false
    foreach ($key in $modifiers) {
        if ([ReqraftForegroundWindow]::GetAsyncKeyState($key) -band 0x8000) { $held = $true }
    }
    if (-not $held) { break }
    Start-Sleep -Milliseconds 15
}

$window = [ReqraftForegroundWindow]::GetForegroundWindow()
if ($window -eq [IntPtr]::Zero) {
    throw 'Windows did not report a foreground window.'
}

[uint32]$processId = 0
[void][ReqraftForegroundWindow]::GetWindowThreadProcessId($window, [ref]$processId)
$process = Get-Process -Id $processId -ErrorAction Stop

# The selection, read without touching the clipboard. Chromium and Electron
# windows usually expose no TextPattern: null, and the capture copies instead.
# Base64 keeps the text intact through the console's code page.
$selection = $null
try {
    $element = [System.Windows.Automation.AutomationElement]::FocusedElement
    $pattern = $null
    if ($null -ne $element -and $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
        $text = (@($pattern.GetSelection()) | ForEach-Object { $_.GetText(-1) }) -join ''
        $selection = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text))
    }
} catch {
    $selection = $null
}

[pscustomobject]@{
    id = [int]$process.Id
    name = [string]$process.ProcessName
    window = [int64]$window.ToInt64()
    selection = $selection
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
  /** Read by the last `frontmostApp`, handed out once by `readSelection`. */
  let pendingSelection: string | null = null;

  async function frontmostApp(): Promise<string> {
    // Cleared first: a failed read must not hand out an older selection.
    pendingSelection = null;
    const target = parseWindowsTarget(
      await run(READ_FOREGROUND_TARGET, FOREGROUND_READ_TIMEOUT_MS),
    );
    rememberedTargets.set(target.name, target);
    pendingSelection = target.selection === null ? null : decodeBase64(target.selection);
    return target.name;
  }

  async function activateApp(name: string, timeoutMs = 1500): Promise<boolean> {
    const target = rememberedTargets.get(name);
    if (target === undefined) return false;

    const script = activationScript(target, timeoutMs);
    return (await run(script, timeoutMs + ACTIVATION_START_MS)).trim().toLowerCase() === "true";
  }

  /**
   * The selection UI Automation returned with the foreground read, which the
   * capture always runs first. Starting PowerShell again only to read it
   * would cost another second.
   */
  function readSelection(): Promise<string | null> {
    const selection = pendingSelection;
    pendingSelection = null;
    return Promise.resolve(selection);
  }

  async function sendKeystroke(letter: "c" | "v"): Promise<void> {
    // The foreground read already waited for the shortcut's keys to be up.
    const keys = CONTROL_KEY[letter];
    await run(String.raw`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${keys}')
`);
  }

  return {
    frontmostApp,
    activateApp,
    readSelection,
    sendKeystroke,
    hasAutomation: () => Promise.resolve(true),
  };
}

function activationScript(target: WindowsTarget, timeoutMs: number): string {
  const processId = String(target.id);
  return String.raw`
${FOREGROUND_WINDOW_API}
Add-Type -AssemblyName Microsoft.VisualBasic

$deadline = [DateTime]::UtcNow.AddMilliseconds(${String(timeoutMs)})
$target = [IntPtr]::new([int64]${String(target.window)})

if ([ReqraftForegroundWindow]::IsWindow($target)) {
    # The exact window the text came from: bringing back "the process" could
    # paste into another of its windows.
    if ([ReqraftForegroundWindow]::IsIconic($target)) {
        [void][ReqraftForegroundWindow]::ShowWindow($target, 9)
    }
    [void][ReqraftForegroundWindow]::SetForegroundWindow($target)
    do {
        if ([ReqraftForegroundWindow]::GetForegroundWindow() -eq $target) {
            Write-Output 'true'
            exit 0
        }
        Start-Sleep -Milliseconds 20
    } while ([DateTime]::UtcNow -lt $deadline)
    Write-Output 'false'
    exit 0
}

# The window is gone (closed, or recreated by its app): bring the process back.
try {
    [Microsoft.VisualBasic.Interaction]::AppActivate([int]${processId})
} catch [System.ArgumentException] {
    Write-Output 'false'
    exit 0
}

do {
    $window = [ReqraftForegroundWindow]::GetForegroundWindow()
    [uint32]$foregroundProcessId = 0
    [void][ReqraftForegroundWindow]::GetWindowThreadProcessId(
        $window,
        [ref]$foregroundProcessId
    )
    if ($foregroundProcessId -eq ${processId}) {
        Write-Output 'true'
        exit 0
    }
    Start-Sleep -Milliseconds 20
} while ([DateTime]::UtcNow -lt $deadline)

Write-Output 'false'
`;
}

function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

function parseWindowsTarget(output: string): WindowsTarget {
  const value: unknown = JSON.parse(output);
  if (!isWindowsTarget(value)) {
    throw new Error("Windows returned an invalid foreground-window response.");
  }
  return { ...value, selection: value.selection ?? null };
}

function isWindowsTarget(
  value: unknown,
): value is Omit<WindowsTarget, "selection"> & { selection?: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const target = value as Partial<WindowsTarget>;
  if (typeof target.id !== "number" || !Number.isInteger(target.id) || target.id <= 0) return false;
  if (typeof target.window !== "number" || !Number.isInteger(target.window) || target.window <= 0) {
    return false;
  }
  if (target.selection != null && typeof target.selection !== "string") return false;
  return typeof target.name === "string" && target.name.length > 0;
}
