# Providers

Reqraft uses native `fetch` and a small adapter layer so you can switch providers without changing the core logic.

## Supported providers

- `anthropic` — Anthropic Messages API
- `openai` — OpenAI Chat Completions API
- `deepseek` — DeepSeek API (OpenAI-compatible)
- `mistral` — Mistral API (OpenAI-compatible)
- `openai-compatible` — Any OpenAI-compatible endpoint
- `mock` — Test provider only

## Environment variables

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
MISTRAL_API_KEY=...
RP_OPENAI_COMPATIBLE_BASE_URL=https://...
RP_OPENAI_COMPATIBLE_API_KEY=...
```

Keys are never written to `config.json` or logs.

## Model presets

Presets are recommendations, not hardcoded defaults. The registry is dated and can be updated.

| Preset            | Provider   | Model                |
|-------------------|------------|----------------------|
| Recommended       | Anthropic  | claude-haiku-4-5     |
| Budget            | DeepSeek   | deepseek-v4-flash    |
| OpenAI            | OpenAI     | gpt-5-mini           |
| European          | Mistral    | mistral-small-2603   |
| Quality           | Anthropic  | claude-sonnet-5      |

You can use any model identifier with `--model`.

## OpenAI Compatible

Use this provider for local models, gateways, or future services:

```bash
rp "test" --provider openai-compatible --model llama3
```

Set `RP_OPENAI_COMPATIBLE_BASE_URL` to the endpoint root.
