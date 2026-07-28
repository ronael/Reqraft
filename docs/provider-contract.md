# Provider Contract

Reqraft validates OpenAI first, with `gpt-4.1-mini` as the current reference model.
Other providers must reproduce the same product behavior through the common engine; they must not change common fidelity rules to improve their own score.

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

Frozen reference acceptance run:

- 40 fidelity cases;
- 0 provider or empty-output failures;
- mean score: 0.975;
- 35 cases scored 1.00;
- median latency: about 1.1 s; P95: about 3.2 s;
- no reasoning tokens;
- `minimal`, `standard` and `complete` behave consistently.

The benchmark dataset in `benchmark/fidelity-cases.ts` is the OpenAI reference suite. It deliberately retains regression cases for Apple-style landing pages, login corrections, responsive forms, `refactor` / `refactore`, and `PR` / `pull request` wording.

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

## Anthropic Adapter Contract

Candidate reference model:

```text
provider: anthropic
model: claude-haiku-4-5
```

The Anthropic adapter uses the Messages endpoint with these provider-only decisions:

- `POST /v1/messages`;
- `x-api-key` and `anthropic-version: 2023-06-01` headers;
- `max_tokens`, `temperature`, `system` and one user message;
- `stream` is propagated from the common request;
- SSE `text_delta` events are collected into the same final `text` field as non-streaming responses;
- Message input and output usage map to common token fields; output tokens are visible tokens because Anthropic does not expose a separate reasoning-token field here;
- error events emitted inside a successful SSE HTTP response become `ProviderError` instances.

Anthropic validation must use `benchmark/fidelity-cases.ts` unchanged:

```sh
pnpm test tests/integration/providers.test.ts
zsh -ic 'pnpm benchmark:fidelity anthropic claude-haiku-4-5'
```

Acceptance requires no empty response or invalid API parameter, a mean fidelity score of at least 0.90, no disproportionate minimal output, reasonable median latency, and no changes to common fidelity rules solely for Anthropic.

### Anthropic Validation Result

The real reference run completed with the unchanged 40-case dataset:

- 40 cases, 0 failures and no empty response;
- mean fidelity score: 0.90625 (threshold: 0.90);
- median latency: 1.959 s; P95: 2.926 s;
- 0 reasoning tokens and 0 disproportionate minimal outputs;
- no invalid API parameter observed.

Anthropic Haiku is therefore functionally validated against the common behavior. It is slower than the OpenAI `gpt-4.1-mini` reference run, which remains the default reference implementation; the provider comparison does not justify changing the common engine or the OpenAI model.
