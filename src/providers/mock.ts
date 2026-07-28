import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
} from "../core/types.js";

export class MockProvider implements ProviderAdapter {
  readonly id = "mock";
  readonly name = "Mock Provider";

  generate(request: ProviderRequest): Promise<ProviderResponse> {
    return Promise.resolve({
      text: JSON.stringify({
        rewritten: `[mock] ${request.userPrompt}`,
        changes: ["Mock reformulation applied"],
        warnings: [],
      }),
      usage: { inputTokens: 10, outputTokens: 20 },
      model: "mock-model",
      finishReason: "stop",
    });
  }

  validateConfiguration(): Promise<ProviderHealth> {
    return Promise.resolve({ ok: true, message: "Mock provider is always available" });
  }
}
