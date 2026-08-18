import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
} from "@/core/types.js";

export class MockProvider implements ProviderAdapter {
  readonly id = "mock";
  readonly name = "Mock Provider";

  generate(request: ProviderRequest): Promise<ProviderResponse> {
    const originalInput = extractOriginalInput(request.userPrompt);
    return Promise.resolve({
      text: JSON.stringify({
        rewritten: `[mock] ${originalInput}`,
        changes: ["Mock reformulation applied"],
        warnings: [],
      }),
      usage: { inputTokens: 10, outputTokens: 20, visibleOutputTokens: 20 },
      model: "mock-model",
      finishReason: "stop",
    });
  }

  validateConfiguration(): Promise<ProviderHealth> {
    return Promise.resolve({ ok: true });
  }
}

function extractOriginalInput(userPrompt: string): string {
  const fenced = /```\n([\s\S]*?)\n```/.exec(userPrompt);
  return (fenced?.[1] ?? userPrompt).trim();
}
