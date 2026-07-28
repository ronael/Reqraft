import { describe, expect, it } from "vitest";
import { ConfigSchema, mergeConfig } from "../../src/config/schema.js";
import { getConfigDir, getConfigPath } from "../../src/config/paths.js";
import { getPresetModels } from "../../src/models/presets.js";

describe("config schema", () => {
  it("parses valid config", () => {
    const config = ConfigSchema.parse({
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      defaultProfile: "code",
      defaultLevel: "complete",
      copyAfterGeneration: true,
      stream: false,
      timeoutMs: 60000,
      showChanges: true,
      showStats: true,
      telemetry: false,
    });
    expect(config.defaultProvider).toBe("openai");
    expect(config.timeoutMs).toBe(60000);
    expect(config.showStats).toBe(true);
  });

  it("applies defaults", () => {
    const config = ConfigSchema.parse({});
    expect(config.defaultProvider).toBe("anthropic");
    expect(config.defaultModel).toBe("claude-haiku-4-5");
    expect(config.timeoutMs).toBe(30000);
    expect(config.showStats).toBe(false);
  });

  it("accepts boolean-like showStats values from existing configs", () => {
    const config = ConfigSchema.parse({ showStats: "true" });
    expect(config.showStats).toBe(true);
  });

  it("merges with priority CLI > env > file > defaults", () => {
    const merged = mergeConfig(
      ConfigSchema.parse({}),
      { defaultProvider: "openai" },
      { defaultModel: "gpt-5-nano" },
      { defaultLevel: "complete" },
    );
    expect(merged.defaultProvider).toBe("openai"); // from file
    expect(merged.defaultModel).toBe("gpt-5-nano"); // from env
    expect(merged.defaultLevel).toBe("complete"); // from cli
  });
});

describe("model presets", () => {
  it("uses sourced OpenAI model ids", () => {
    const openaiPresets = getPresetModels().filter((preset) => preset.provider === "openai");
    const openaiModels = openaiPresets.map((preset) => preset.id);

    expect(openaiModels).toEqual(["gpt-5-mini", "gpt-5-nano", "gpt-5.1"]);
    expect(openaiModels.some((id) => id.includes("gpt-5.4"))).toBe(false);
    expect(openaiPresets.find((preset) => preset.id === "gpt-5-mini")?.reasoningEffort).toBeUndefined();
    expect(openaiPresets.find((preset) => preset.id === "gpt-5-nano")?.reasoningEffort).toBeUndefined();
    expect(openaiPresets.find((preset) => preset.id === "gpt-5.1")?.reasoningEffort).toBe("none");
  });
});

describe("config paths", () => {
  it("returns absolute config paths", () => {
    expect(getConfigDir()).toContain("rp");
    expect(getConfigPath()).toContain("config.json");
  });
});
