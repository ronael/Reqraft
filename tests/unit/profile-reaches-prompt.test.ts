import { describe, expect, it } from "vitest";
import { rewrite } from "@/core/engine.js";
import type { ProviderAdapter, ProviderRequest } from "@/core/types.js";
import { buildPrompt, levelAwareProfileGuidance } from "@/core/prompt-builder.js";
import { BUILTIN_PROFILES, getBuiltinProfile } from "@/profiles/builtins.js";
import { customProfileToPromptProfile } from "@/profiles/custom.js";
import type { PromptProfile } from "@/profiles/types.js";
import type { RepromptLevel } from "@/core/types.js";

/**
 * What a profile says has to reach the model.
 *
 * This is the check the suite was missing. Every other test asserted that a
 * profile was stored, listed, selected and resolved — none asked whether it
 * changed the prompt. It did not: a local profile's `instructions` were read by
 * nothing, so two profiles with opposite instructions produced the same request
 * and the feature only looked like it worked.
 *
 * Asserting on the built prompt is what makes that visible without a provider
 * call: the system prompt is the whole of what the profile contributes.
 */

const LEVELS: readonly RepromptLevel[] = ["minimal", "standard", "complete"];

function systemPromptFor(profile: PromptProfile, level: RepromptLevel): string {
  return buildPrompt({
    input: "réécris ça",
    profile,
    level,
    includeChanges: true,
  }).systemPrompt;
}

const LOCAL: PromptProfile = customProfileToPromptProfile({
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie, cite le numéro de ticket, propose une action.",
});

describe("a local profile reaches the model", () => {
  it("sends its instructions, not a sentence about them", () => {
    const prompt = systemPromptFor(LOCAL, "standard");
    expect(prompt).toContain("cite le numéro de ticket");
  });

  it("sends them at complete too", () => {
    expect(systemPromptFor(LOCAL, "complete")).toContain("cite le numéro de ticket");
  });

  it("makes two different profiles produce two different prompts", () => {
    // The failure this whole file exists for: with only the name and the
    // description reaching the model, these two were the same request.
    const other = customProfileToPromptProfile({
      schemaVersion: 1,
      id: "support-bis",
      name: "Support client",
      description: "Reformule pour le support.",
      defaultLevel: "standard",
      instructions: "Réponds en une seule phrase, sans formule de politesse.",
    });

    expect(systemPromptFor(LOCAL, "standard")).not.toBe(systemPromptFor(other, "standard"));
  });

  it("carries the instructions inherited from a base profile", () => {
    const withBase = customProfileToPromptProfile(
      {
        schemaVersion: 1,
        id: "support-clean",
        name: "Support clean",
        description: "Support, sur base clean.",
        extends: "clean",
        defaultLevel: "standard",
        instructions: "Termine par une question ouverte.",
      },
      getBuiltinProfile("clean"),
    );

    const prompt = systemPromptFor(withBase, "standard");
    // Both halves of the resolved profile: the parent's, then the child's.
    expect(prompt).toContain("Termine par une question ouverte.");
    expect(prompt).toContain(getBuiltinProfile("clean")?.instructions.slice(0, 30) ?? "");
  });

  it("keeps its instructions at minimal, alongside the restraint", () => {
    // `minimal` used to discard them outright, which made a profile saying
    // "toujours en majuscules" look broken: that is a constraint on the form,
    // not an enrichment of the content, so the level has no reason to drop it.
    const prompt = systemPromptFor(LOCAL, "minimal");
    expect(prompt).toContain("cite le numéro de ticket");
    expect(prompt).toContain("prioritaire sur le profil");
    // The relationship is stated, so the two cannot read as contradictory.
    expect(prompt).toContain("sans développer le contenu");
  });
});

describe("built-in profiles keep their curated line", () => {
  it("still overrides a built-in outright at minimal", () => {
    // The rule `minimal` exists for: stopping `code` or `web-design` from
    // enriching a request the user only wanted corrected.
    for (const profile of BUILTIN_PROFILES) {
      const guidance = levelAwareProfileGuidance(profile, "minimal");
      expect(guidance).not.toContain("Consignes du profil");
      expect(guidance).toContain("prioritaire sur le profil");
    }
  });

  it("never sends a built-in's full instructions block", () => {
    // Deliberate: `buildAutoDetectPrompt` sends one line per built-in, so the
    // long form would multiply the system prompt's size.
    for (const profile of BUILTIN_PROFILES) {
      const guidance = levelAwareProfileGuidance(profile, "complete");
      expect(guidance).not.toContain(profile.instructions.slice(0, 30));
    }
  });

  it("gives every built-in some guidance at every level", () => {
    for (const profile of BUILTIN_PROFILES) {
      for (const level of LEVELS) {
        // Not the id: `writing`'s line names the profile in French ("Profil
        // rédaction"). What matters is that a line exists and says something.
        const guidance = levelAwareProfileGuidance(profile, level);
        expect(guidance.length).toBeGreaterThan(20);
      }
    }
  });
});

/**
 * A provider that answers like the mock one but keeps what it was sent.
 *
 * Asserting on `buildPrompt` alone proves the builder is right; it does not
 * prove the engine calls it with the profile the user chose. This closes that
 * gap without a network call — the request captured here is byte for byte the
 * one a real provider would receive.
 */
class CapturingProvider implements ProviderAdapter {
  readonly id = "mock";
  readonly name = "Capturing";
  lastRequest: ProviderRequest | null = null;

  generate(request: ProviderRequest) {
    this.lastRequest = request;
    return Promise.resolve({
      text: JSON.stringify({ rewritten: "ok", changes: [], warnings: [] }),
      usage: { inputTokens: 1, outputTokens: 1, visibleOutputTokens: 1 },
      model: "mock-model",
      finishReason: "stop" as const,
    });
  }

  validateConfiguration() {
    return Promise.resolve({ ok: true });
  }
}

describe("the engine sends the chosen profile, end to end", () => {
  async function requestFor(profile: PromptProfile, level: RepromptLevel) {
    const provider = new CapturingProvider();
    await rewrite({
      input: "fais une page de contact",
      profile,
      level,
      provider,
      model: "mock-model",
      includeChanges: true,
    });
    return provider.lastRequest;
  }

  it("puts a local profile's instructions in the request it sends", async () => {
    const request = await requestFor(LOCAL, "standard");
    expect(request?.systemPrompt).toContain("cite le numéro de ticket");
  });

  it("sends a different request for a different profile", async () => {
    // The condition the real run reproduced: same name, same description, only
    // the instructions differ. These used to produce identical requests.
    const other = customProfileToPromptProfile({
      schemaVersion: 1,
      id: "support-bis",
      name: "Support client",
      description: "Reformule pour le support.",
      defaultLevel: "standard",
      instructions: "Réponds en une seule phrase, sans formule de politesse.",
    });

    const first = await requestFor(LOCAL, "standard");
    const second = await requestFor(other, "standard");

    expect(first?.systemPrompt).not.toBe(second?.systemPrompt);
    expect(second?.systemPrompt).toContain("sans formule de politesse");
  });
});
