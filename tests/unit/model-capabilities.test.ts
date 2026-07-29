import { describe, expect, it } from "vitest";
import { resolveModelCapabilities } from "../../src/models/capabilities.js";

describe("model capabilities", () => {
  it("resolves GPT-5 family constraints for dated model identifiers", () => {
    const capabilities = resolveModelCapabilities("openai", "gpt-5-mini-2025-08-07");

    expect(capabilities.supportsTemperature).toBe(false);
    expect(capabilities.reasoningEfforts).toContain("low");
  });

  it("keeps legacy OpenAI chat models on temperature without reasoning", () => {
    const capabilities = resolveModelCapabilities("openai", "gpt-4.1-mini");

    expect(capabilities.supportsTemperature).toBe(true);
    expect(capabilities.reasoningEfforts).toEqual([]);
  });

  it("supports the explicit none reasoning mode for GPT-5.1", () => {
    const capabilities = resolveModelCapabilities("openai", "gpt-5.1");

    expect(capabilities.supportsTemperature).toBe(false);
    expect(capabilities.reasoningEfforts).toContain("none");
  });
});
