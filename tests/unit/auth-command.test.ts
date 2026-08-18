import { describe, expect, it, vi } from "vitest";
import { runAuth } from "@/apps/cli/commands/auth.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

function captureErrors(): { output: { error(message: string): void }; errors: string[] } {
  const errors: string[] = [];
  return {
    output: {
      error(message: string): void {
        errors.push(message);
      },
    },
    errors,
  };
}

describe("auth command", () => {
  it("runs credential status without requiring a provider", async () => {
    const credentialStatus = vi.fn().mockResolvedValue(undefined);

    await expect(runAuth("status", undefined, { credentialStatus })).resolves.toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(credentialStatus).toHaveBeenCalledOnce();
  });

  it("rejects invalid providers without throwing from the CLI layer", async () => {
    const { output, errors } = captureErrors();

    await expect(runAuth("login", "openai-compatible", { output })).resolves.toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors).toEqual(["Provider invalide."]);
  });

  it("rejects invalid actions", async () => {
    const { output, errors } = captureErrors();

    await expect(runAuth("rotate", "openai", { output })).resolves.toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors).toEqual(["Action invalide : login, logout ou status."]);
  });

  it("dispatches login and logout to secure credential handlers", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    const logout = vi.fn().mockResolvedValue(undefined);

    await expect(runAuth("login", "openai", { login })).resolves.toBe(EXIT_CODES.SUCCESS);
    await expect(runAuth("logout", "openai", { logout })).resolves.toBe(EXIT_CODES.SUCCESS);

    expect(login).toHaveBeenCalledWith("openai");
    expect(logout).toHaveBeenCalledWith("openai");
  });
});
