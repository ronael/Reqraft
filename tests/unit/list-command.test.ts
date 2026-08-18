import { describe, expect, it } from "vitest";
import { runModelsList, runProfilesList, runProvidersList } from "@/apps/cli/commands/list.js";
import { listProviderDefinitions } from "@/providers/catalog.js";
import { listProfiles } from "@/profiles/registry.js";

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

describe("list commands", () => {
  it("lists profiles from the profile registry", () => {
    const { output, logs } = captureOutput();

    runProfilesList(output);

    const report = logs.join("\n");
    expect(report).toContain("auto");
    for (const profile of listProfiles()) {
      expect(report).toContain(profile.id);
      expect(report).toContain(profile.name);
    }
  });

  it("lists providers from the provider catalog", () => {
    const { output, logs } = captureOutput();

    runProvidersList(output);

    const report = logs.join("\n");
    for (const definition of listProviderDefinitions()) {
      expect(report).toContain(definition.id);
      expect(report).toContain(definition.label);
    }
  });

  it("groups models with provider labels from the provider catalog", () => {
    const { output, logs } = captureOutput();

    runModelsList(output);

    const report = logs.join("\n");
    expect(report).toContain("openai — OpenAI");
    expect(report).toContain("anthropic — Anthropic");
    expect(report).toContain("gpt-4.1-mini");
  });
});
