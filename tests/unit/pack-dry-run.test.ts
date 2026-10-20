import { describe, expect, it } from "vitest";
import { npmPackCommand } from "../../scripts/pack-dry-run.js";

describe("npm pack dry run command", () => {
  it("runs the npm batch shim through the Windows command processor", () => {
    const command = npmPackCommand("win32");

    expect(command.command.toLowerCase()).toMatch(/(?:cmd\.exe|cmd)$/);
    expect(command.args).toEqual(["/d", "/s", "/c", "npm.cmd pack --dry-run --ignore-scripts"]);
  });

  it("spawns npm directly on Unix platforms", () => {
    const expected = {
      command: "npm",
      args: ["pack", "--dry-run", "--ignore-scripts"],
    };

    expect(npmPackCommand("linux")).toEqual(expected);
    expect(npmPackCommand("darwin")).toEqual(expected);
  });
});
