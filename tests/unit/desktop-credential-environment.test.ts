import { describe, expect, it, vi } from "vitest";
import { ConfigSchema } from "@/config/schema.js";
import { createDesktopCredentialEnvironment } from "@/apps/desktop/main/credential-environment.js";

describe("desktop credential environment", () => {
  it("uses the keychain for an explicitly selected provider without mutating the source", async () => {
    const source = {
      ANTHROPIC_API_KEY: "environment-key",
      OPENAI_API_KEY: "openai-environment-key",
    };
    const hydrate = vi.fn((env: NodeJS.ProcessEnv) => {
      env.ANTHROPIC_API_KEY = "keychain-key";
      return Promise.resolve();
    });

    const result = await createDesktopCredentialEnvironment(
      source,
      ConfigSchema.parse({ desktopKeychainProviders: ["anthropic"] }),
      hydrate,
    );

    expect(result.ANTHROPIC_API_KEY).toBe("keychain-key");
    expect(result.OPENAI_API_KEY).toBe("openai-environment-key");
    expect(source.ANTHROPIC_API_KEY).toBe("environment-key");
  });
});
