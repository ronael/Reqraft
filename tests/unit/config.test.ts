import { describe, expect, it } from "vitest";
import { ConfigSchema, mergeConfig } from "../../src/config/schema.js";
import { getConfigDir, getConfigPath } from "../../src/config/paths.js";

describe("config schema", () => {
  it("parses valid config", () => {
    const config = ConfigSchema.parse({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4-mini",
      defaultProfile: "code",
      defaultLevel: "complete",
      copyAfterGeneration: true,
      stream: false,
      timeoutMs: 60000,
      showChanges: true,
      telemetry: false,
    });
    expect(config.defaultProvider).toBe("openai");
    expect(config.timeoutMs).toBe(60000);
  });

  it("applies defaults", () => {
    const config = ConfigSchema.parse({});
    expect(config.defaultProvider).toBe("anthropic");
    expect(config.defaultModel).toBe("claude-haiku-4-5");
    expect(config.timeoutMs).toBe(30000);
  });

  it("merges with priority CLI > env > file > defaults", () => {
    const merged = mergeConfig(
      ConfigSchema.parse({}),
      { defaultProvider: "openai" },
      { defaultModel: "gpt-5.4-nano" },
      { defaultLevel: "complete" },
    );
    expect(merged.defaultProvider).toBe("openai"); // from file
    expect(merged.defaultModel).toBe("gpt-5.4-nano"); // from env
    expect(merged.defaultLevel).toBe("complete"); // from cli
  });
});

describe("config paths", () => {
  it("returns absolute config paths", () => {
    expect(getConfigDir()).toContain("rp");
    expect(getConfigPath()).toContain("config.json");
  });
});
