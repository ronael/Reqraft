import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/loader.js";
import { ConfigSchema, mergeConfig, parseConfigValue } from "../../src/config/schema.js";
import { getConfigDir, getConfigPath } from "../../src/config/paths.js";
import { DEFAULT_REPROMPT_LEVEL, REPROMPT_LEVELS } from "../../src/core/levels.js";
import { DEFAULT_FIDELITY_MODE, FIDELITY_MODES } from "../../src/core/types.js";
import { DEFAULT_MODEL_ID, getPresetModels } from "../../src/models/presets.js";
import { resolveModel } from "../../src/models/model-resolver.js";
import { DEFAULT_PROVIDER_ID } from "../../src/providers/catalog.js";
import { AUTO_PROFILE_ID } from "../../src/profiles/profile-ids.js";

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
      uiLocale: "fr",
      outputLanguage: "en",
      telemetry: false,
    });
    expect(config.defaultProvider).toBe("openai");
    expect(config.timeoutMs).toBe(60000);
    expect(config.showStats).toBe(true);
    expect(config.uiLocale).toBe("fr");
    expect(config.outputLanguage).toBe("en");
  });

  it("applies defaults", () => {
    const config = ConfigSchema.parse({});
    expect(config.defaultProvider).toBe(DEFAULT_PROVIDER_ID);
    expect(config.defaultModel).toBe(DEFAULT_MODEL_ID);
    expect(config.defaultProfile).toBe(AUTO_PROFILE_ID);
    expect(config.defaultLevel).toBe(DEFAULT_REPROMPT_LEVEL);
    expect(config.fidelityMode).toBe(DEFAULT_FIDELITY_MODE);
    expect(config.timeoutMs).toBe(30000);
    expect(config.showStats).toBe(false);
    expect(config.uiLocale).toBe("auto");
    expect(config.outputLanguage).toBe("auto");
  });

  it("derives the loader defaults from the schema defaults", () => {
    expect(DEFAULT_CONFIG).toEqual(ConfigSchema.parse({}));
  });

  it("uses the shared reprompt level registry", () => {
    for (const level of REPROMPT_LEVELS) {
      expect(ConfigSchema.parse({ defaultLevel: level }).defaultLevel).toBe(level);
    }
  });

  it("uses the shared fidelity mode registry", () => {
    for (const mode of FIDELITY_MODES) {
      expect(ConfigSchema.parse({ fidelityMode: mode }).fidelityMode).toBe(mode);
    }
  });

  it("accepts boolean-like showStats values from existing configs", () => {
    const config = ConfigSchema.parse({ showStats: "true" });
    expect(config.showStats).toBe(true);
  });

  it("parses config command values with strict boolean handling", () => {
    expect(parseConfigValue("showStats", "true")).toBe(true);
    expect(parseConfigValue("showStats", "false")).toBe(false);
    expect(() => parseConfigValue("showStats", "yes")).toThrow("config.value_invalid");
    expect(parseConfigValue("timeoutMs", "5000")).toBe(5000);
    expect(parseConfigValue("defaultProfile", "frontend")).toBe("frontend");
    expect(parseConfigValue("uiLocale", "fr")).toBe("fr");
    expect(() => parseConfigValue("uiLocale", "de")).toThrow("config.value_invalid");
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

    expect(openaiModels).toEqual(["gpt-4.1-mini", "gpt-5-mini", "gpt-5-nano", "gpt-5.1"]);
    expect(openaiModels.some((id) => id.includes("gpt-5.4"))).toBe(false);
    expect(openaiPresets.find((preset) => preset.id === "gpt-5-mini")?.reasoningEffort).toBe("low");
    expect(openaiPresets.find((preset) => preset.id === "gpt-5-nano")?.reasoningEffort).toBe("low");
    expect(openaiPresets.find((preset) => preset.id === "gpt-5.1")?.reasoningEffort).toBe("none");
    expect(openaiPresets.find((preset) => preset.id === "gpt-4.1-mini")?.recommended).toBe(true);
  });

  it("resolves dated OpenAI model ids to their preset parameters", () => {
    const resolved = resolveModel("openai", "gpt-5-mini-2025-08-07", "gpt-5-mini");
    expect(resolved.reasoningEffort).toBe("low");
  });
});

describe("config paths", () => {
  it("returns absolute config paths", () => {
    expect(getConfigDir()).toContain("rp");
    expect(getConfigPath()).toContain("config.json");
  });
});
