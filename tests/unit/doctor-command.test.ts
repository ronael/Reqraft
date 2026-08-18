import { describe, expect, it } from "vitest";
import { runDoctor } from "@/commands/doctor.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "@/core/types.js";
import type { BuiltinProvider } from "@/providers/catalog.js";

function captureOutput(): { output: { log(message: string): void }; logs: string[] } {
  const logs: string[] = [];
  return {
    output: {
      log(message: string): void {
        logs.push(message);
      },
    },
    logs,
  };
}

function createHealthyProvider(id: BuiltinProvider): ProviderAdapter {
  return {
    id,
    name: id,
    generate(_request: ProviderRequest): Promise<ProviderResponse> {
      return Promise.resolve({ text: "ok" });
    },
    validateConfiguration() {
      return Promise.resolve({ ok: true });
    },
  };
}

describe("doctor command", () => {
  it("prints configuration, key sources and provider health from injected dependencies", async () => {
    const { output, logs } = captureOutput();

    await runDoctor({
      output,
      env: { OPENAI_API_KEY: "redacted" },
      loadConfig: () => Promise.resolve({ ...DEFAULT_CONFIG, defaultProvider: "openai" }),
      configPath: () => "/home/reqraft/.config/reqraft/config.json",
      hydrateCredentials: () => Promise.resolve(),
      createProvider: (id) => createHealthyProvider(id),
    });

    const report = logs.join("\n");
    expect(report).toContain("reqraft doctor");
    expect(report).toContain("/home/reqraft/.config/reqraft/config.json");
    expect(report).toContain("Provider");
    expect(report).toContain("openai");
    expect(report).toContain("OpenAI     : configuré");
    expect(report).toContain("Anthropic  : non configuré");
    expect(report).toContain("OpenAI               : OK");
  });
});
