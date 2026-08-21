import { describe, expect, it } from "vitest";
import { openInEditor, systemOpenCommand } from "@/profiles/editor.js";

/**
 * The launcher is injected throughout: a test that really spawned `open` would
 * put a window on the screen of whoever ran the suite.
 */

describe("systemOpenCommand", () => {
  it("uses each platform's own opener", () => {
    expect(systemOpenCommand("darwin")).toEqual({ command: "open", args: [] });
    expect(systemOpenCommand("linux")).toEqual({ command: "xdg-open", args: [] });
  });

  it("passes an empty title on Windows, where start would eat the path", () => {
    // `start "C:\\...json"` treats its first quoted argument as the window
    // title and opens nothing.
    const { command, args } = systemOpenCommand("win32");
    expect(command).toBe("cmd");
    expect(args).toEqual(["/c", "start", ""]);
  });

  it("falls back to the freedesktop opener for anything else", () => {
    expect(systemOpenCommand("freebsd").command).toBe("xdg-open");
  });
});

describe("openInEditor", () => {
  it("hands the file to the system opener", () => {
    const calls: { command: string; args: readonly string[] }[] = [];

    const result = openInEditor("/home/someone/.config/rp/profiles/support.reqraft-profile.json", {
      platform: "darwin",
      launch: (command, args) => calls.push({ command, args }),
    });

    expect(result.command).toBe("open");
    expect(calls).toEqual([
      { command: "open", args: ["/home/someone/.config/rp/profiles/support.reqraft-profile.json"] },
    ]);
  });

  it("keeps the file last on Windows, after start's title argument", () => {
    const calls: { command: string; args: readonly string[] }[] = [];

    openInEditor("C:\\profiles\\support.reqraft-profile.json", {
      platform: "win32",
      launch: (command, args) => calls.push({ command, args }),
    });

    expect(calls[0]?.args).toEqual([
      "/c",
      "start",
      "",
      "C:\\profiles\\support.reqraft-profile.json",
    ]);
  });

  it("passes a path with spaces as one argument", () => {
    // The real profiles directory on macOS is under "Application Support";
    // splitting it would open two things, neither of them the profile.
    const seen: string[][] = [];

    openInEditor("/Users/someone/Library/Application Support/rp/profiles/a.json", {
      platform: "darwin",
      launch: (_command, args) => seen.push([...args]),
    });

    expect(seen[0]).toHaveLength(1);
    expect(seen[0]?.[0]).toContain("Application Support");
  });
});
