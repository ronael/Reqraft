import { describe, expect, it } from "vitest";
import {
  assertCredentialIsNotPlaceholder,
  assertEnvironmentCredentials,
} from "../../src/auth/credentials.js";
import { ProviderError } from "../../src/providers/errors.js";
import { formatUiError } from "../../src/ui/errors.js";

describe("secure credentials", () => {
  it.each(["ta-clé", "votre-clé", "your-api-key"])(
    "rejects placeholder credential %s",
    (secret) => {
      expect(() => {
        assertCredentialIsNotPlaceholder(secret);
      }).toThrow("ressemble à un exemple");
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
    }).toThrow("OPENAI_API_KEY contient une valeur d’exemple invalide");
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
