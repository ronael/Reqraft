import { describe, expect, it } from "vitest";
import { runConfig } from "../../src/commands/config.js";
import { EXIT_CODES } from "../../src/utils/exit-codes.js";

function captureOutput(): {
  output: { log(message: string): void; error(message: string): void };
  logs: string[];
  errors: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    output: {
      log(message: string): void {
        logs.push(message);
      },
      error(message: string): void {
        errors.push(message);
      },
    },
    logs,
    errors,
  };
}

describe("config command", () => {
  it("returns invalid input without exiting the process when set arguments are missing", async () => {
    const { output, errors } = captureOutput();

    await expect(runConfig("set", undefined, undefined, output)).resolves.toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors).toEqual(["Usage : rp config set <clé> <valeur>"]);
  });

  it("returns invalid configuration for unknown keys", async () => {
    const { output, errors } = captureOutput();

    await expect(runConfig("get", "unknown", undefined, output)).resolves.toBe(
      EXIT_CODES.INVALID_CONFIGURATION,
    );
    expect(errors).toEqual(["Clé inconnue : unknown"]);
  });
});
