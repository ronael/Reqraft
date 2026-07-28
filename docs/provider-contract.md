# Provider Contract

Reqraft validates OpenAI first, with `gpt-4.1-mini` as the current reference model.
Other providers must later reproduce the same product behavior through the common engine.

## Responsibility Split

The common engine owns:

- prompt profiles;
- reprompt levels;
- fidelity rules;
- proportional length constraints;
- empty output validation;
- internal result parsing;
- stdout/stderr behavior;
- stats formatting;
- clipboard behavior.

Provider adapters own only:

- translating `ProviderRequest` to the provider API payload;
- provider/model capability handling;
- non-streaming and streaming text extraction;
- usage metadata extraction;
- provider-specific errors.

Provider adapters must not decide:

- how to reformulate;
- which sections to add;
- how long the prompt should be;
- which fidelity policy to apply.

## Reference Interface

```ts
interface ProviderAdapter {
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

interface ProviderResponse {
  text: string;
  usage?: {
    inputTokens?: number;
    visibleOutputTokens?: number;
    reasoningTokens?: number;
    outputTokens?: number;
  };
  model?: string;
  finishReason?: string;
}
```

## OpenAI Reference Behavior

Reference provider:

```text
provider: openai
model: gpt-4.1-mini
```

Current payload decisions:

- Chat Completions endpoint.
- `max_completion_tokens`, not `max_tokens`.
- `response_format: { type: "json_object" }` because the common engine currently expects structured `rewritten` and `warnings` fields from all providers.
- `temperature` omitted for `gpt-5*` models.
- `reasoning_effort` sent only for supported model families.

Open question:

- If Reqraft later introduces true text-only provider output, `response_format` can become conditional. For now, CLI text mode still writes only `rewritten` to stdout, while structured provider output remains internal.

## Validation Checklist For Each Provider

- Normal text output is visible and non-empty.
- Empty provider output returns a non-zero exit code.
- Stats go to stderr.
- Rewritten prompt goes to stdout.
- `--json` remains parseable JSON.
- `--explain` prints rewritten prompt to stdout and changes/warnings to stderr.
- Usage metadata maps to the common token fields when available.
- Fidelity warnings/errors come from the common engine.
- Provider adapter does not add product behavior.
- Streaming and non-streaming extraction produce equivalent final text.

