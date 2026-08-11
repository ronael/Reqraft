import { describe, expect, it, vi } from "vitest";
import {
  assertCredentialIsNotPlaceholder,
  assertEnvironmentCredentials,
  credentialStatus,
  login,
  logout,
} from "../../src/auth/credentials.js";
import { ProviderError } from "../../src/providers/errors.js";
import { formatUiError } from "../../src/ui/errors.js";
import type { CredentialProvider } from "../../src/providers/catalog.js";

describe("secure credentials", () => {
  it.each(["ta-clé", "votre-clé", "your-api-key"])(
    "rejects placeholder credential %s",
    (secret) => {
      expect(() => {
        assertCredentialIsNotPlaceholder(secret);
      }).toThrow("credential.placeholder");
    },
  );

  it("accepts a non-placeholder credential without exposing it", () => {
    expect(() => {
      assertCredentialIsNotPlaceholder("sk-live-redacted-value");
    }).not.toThrow();
  });

  it("rejects a placeholder from the environment before a provider request", () => {
    expect(() => {
      assertEnvironmentCredentials({ OPENAI_API_KEY: "ta-clé" });
    }).toThrow("credential.placeholder");
  });

  it("reports credential source from injected environment and secure storage", async () => {
    const logs: string[] = [];
    const storedProviders = new Set<CredentialProvider>(["anthropic"]);

    await credentialStatus({
      env: { OPENAI_API_KEY: "redacted" },
      output: {
        log(message: string): void {
          logs.push(message);
        },
      },
      readCredential: (provider) =>
        Promise.resolve(storedProviders.has(provider) ? "redacted" : undefined),
    });

    const report = logs.join("\n");
    expect(report).toContain("openai     variable d'environnement");
    expect(report).toContain("anthropic  stockage sécurisé");
    expect(report).toContain("mistral    non configurée");
  });

  it("validates a credential before storing it and reports env precedence", async () => {
    const logs: string[] = [];
    const writes: string[] = [];
    const validateCredential = vi.fn().mockResolvedValue(undefined);
    const setCredential = vi.fn().mockResolvedValue(undefined);

    await login("openai", {
      env: { OPENAI_API_KEY: "redacted-env-key" },
      output: {
        log(message: string): void {
          logs.push(message);
        },
        write(message: string): void {
          writes.push(message);
        },
      },
      readSecret: () => Promise.resolve("sk-live-redacted-value"),
      validateCredential,
      setCredential,
    });

    expect(validateCredential).toHaveBeenCalledWith("openai", "sk-live-redacted-value");
    expect(setCredential).toHaveBeenCalledWith("openai", "sk-live-redacted-value");
    expect(writes).toEqual(["Vérification de la clé… "]);
    expect(logs.join("\n")).toContain("OPENAI_API_KEY est déjà définie");
  });

  it("does not store a placeholder credential", async () => {
    const validateCredential = vi.fn().mockResolvedValue(undefined);
    const setCredential = vi.fn().mockResolvedValue(undefined);

    await expect(
      login("openai", {
        output: {
          log: vi.fn(),
          write: vi.fn(),
        },
        readSecret: () => Promise.resolve("ta-clé"),
        validateCredential,
        setCredential,
      }),
    ).rejects.toMatchObject({
      errorCode: "credential.placeholder",
    });

    expect(validateCredential).not.toHaveBeenCalled();
    expect(setCredential).not.toHaveBeenCalled();
  });

  it("deletes credentials through an injectable secure storage boundary", async () => {
    const logs: string[] = [];
    const deleteCredential = vi.fn().mockResolvedValue(undefined);

    await logout("openai", {
      output: {
        log(message: string): void {
          logs.push(message);
        },
      },
      deleteCredential,
    });

    expect(deleteCredential).toHaveBeenCalledWith("openai");
    expect(logs).toEqual(["Clé openai supprimée du stockage sécurisé."]);
  });
});

describe("TUI provider errors", () => {
  it("turns provider authentication errors into an actionable message", () => {
    const error = new ProviderError("Provider error 401: redacted", 3, undefined, {
      httpStatus: 401,
    });
    const message = formatUiError(error, "openai");

    expect(message).toContain("rp auth login openai");
    expect(message).not.toContain("Incorrect API key");
  });

  it("does not expose raw provider response bodies for structured HTTP errors", () => {
    const error = new ProviderError("Provider error 400: secret-detail", 4, undefined, {
      httpStatus: 400,
    });
    const message = formatUiError(error, "openai");

    expect(message).toContain("HTTP 400");
    expect(message).toContain("rp doctor");
    expect(message).not.toContain("secret-detail");
  });

  it("keeps compatibility with legacy provider error messages", () => {
    const error = new Error('Provider error 401: {"error":{"message":"Incorrect API key"}}');
    const message = formatUiError(error, "openai");

    expect(message).toContain("rp auth login openai");
    expect(message).not.toContain("Incorrect API key");
  });
});
