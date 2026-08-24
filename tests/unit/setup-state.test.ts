import { describe, expect, it } from "vitest";
import { evaluateSetupState, type SetupFacts } from "@/config/setup.js";

/**
 * Whether an installation is usable as it stands.
 *
 * The desktop asks this at startup to decide between opening its onboarding
 * and going straight to work, so a wrong answer is either a wizard shown to
 * someone already configured, or an application that silently cannot run.
 */

function facts(overrides: Partial<SetupFacts> = {}): SetupFacts {
  return {
    configFileExists: true,
    provider: "anthropic",
    credentialDetected: true,
    hasCustomProviderEntry: false,
    ...overrides,
  };
}

describe("evaluateSetupState", () => {
  it("accepts a configured installation", () => {
    expect(evaluateSetupState(facts())).toEqual({ usable: true });
  });

  it("treats a missing configuration file as unconfigured", () => {
    // Every field in ConfigSchema has a default, so loading a missing file
    // still yields a valid object. Only the file's existence shows that
    // somebody actually made a choice.
    expect(evaluateSetupState(facts({ configFileExists: false }))).toEqual({
      usable: false,
      blocker: "config_missing",
    });
  });

  it("reports a provider that needs a key and has none", () => {
    expect(evaluateSetupState(facts({ credentialDetected: false }))).toEqual({
      usable: false,
      blocker: "credential_missing",
    });
  });

  it("accepts a provider that needs no key", () => {
    // The mock provider answers without a credential; demanding one would
    // block a perfectly runnable setup.
    expect(evaluateSetupState(facts({ provider: "mock", credentialDetected: false }))).toEqual({
      usable: true,
    });
  });

  it("refuses a compatible endpoint the configuration never declares", () => {
    // The catalogue does not know the URL: without the entry there is
    // literally nothing to call.
    expect(
      evaluateSetupState(facts({ provider: "openai-compatible", hasCustomProviderEntry: false })),
    ).toEqual({ usable: false, blocker: "provider_incomplete" });
  });

  it("accepts a declared compatible endpoint without a key", () => {
    expect(
      evaluateSetupState(
        facts({
          provider: "openai-compatible",
          hasCustomProviderEntry: true,
          credentialDetected: false,
        }),
      ),
    ).toEqual({ usable: true });
  });

  it("reports the missing file before anything else", () => {
    // A blank machine has every problem at once; the first thing to fix is
    // the one the wizard actually starts from.
    expect(
      evaluateSetupState(facts({ configFileExists: false, credentialDetected: false })).blocker,
    ).toBe("config_missing");
  });
});
