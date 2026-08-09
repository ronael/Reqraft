<p align="center">
  <img src="https://raw.githubusercontent.com/ronael/Reqraft/main/docs/assets/reqraft-readme.svg" alt="Reqraft — Shape the request. Keep the intent." width="100%" />
</p>

<p align="center">
  Transform a rough request into a clearer prompt, with local checks for possible scope drift.
</p>

<p align="center">
  <a href="https://github.com/ronael/Reqraft">GitHub</a> ·
  <a href="https://www.npmjs.com/package/@reqraft/cli">npm</a> ·
  <a href="https://ronael.github.io/Reqraft/">Website</a>
</p>

```bash
npm install -g @reqraft/cli
```

```bash
rp
```

```bash
rp "add a button to export the report"
```

## What it does

Reqraft is a local-first, open-source CLI that sits **just before** you send a prompt to Claude Code, Codex, OpenCode, ChatGPT, or another agent. It rewrites your request so the model receives:

- correct spelling and grammar,
- a clear structure,
- preserved technical terms, paths, and commands,
- local quality signals for known scope additions and disproportionate expansion.

## Installation

```bash
npm install -g @reqraft/cli
# or
pnpm add -g @reqraft/cli
```

Two commands are provided and point to the same program:

```bash
rp "your request"
reprompt "your request"
```

Run the first-time setup wizard:

```bash
rp init
rp init --reset
```

## Quick usage

### Direct command

```bash
rp "fix the form on mobile"
```

### Pipe input

```bash
echo "fix this without changing anything else" | rp
```

### Read from file

```bash
rp --file request.md
```

### Copy result to clipboard

```bash
rp "your request" --copy
```

### Structured JSON output

```bash
rp "your request" --json
```

### Diff view

```bash
rp "your request" --diff
```

### Explain changes

```bash
rp "your request" --explain
```

### Quality diagnostics

When a provider returns usable text, Reqraft keeps it available even if its
best-effort fidelity checks identify an expansion or a known scope addition.
Diagnostics are written to stderr and are available as structured data with
`--json`.

```bash
rp "create a detailed architecture plan" --stats
rp "..." --max-output-tokens 2000
rp "..." --timeout 45000
rp "..." --fail-on-quality
```

See [docs/reprompt-policy.md](docs/reprompt-policy.md) for the result, timeout,
token-budget and fidelity contracts.

## Profiles

Use `--profile <name>` to tune the rewriting style:

| Profile      | Use case                        |
| ------------ | ------------------------------- |
| `auto`       | Detect the best profile locally |
| `clean`      | Grammar and light clarification |
| `code`       | Developer agents                |
| `frontend`   | Frontend implementation         |
| `web-design` | Visual design and landing pages |
| `debug`      | Bugs and errors                 |
| `review`     | Code audits and reviews         |
| `writing`    | Emails, messages, documents     |

## Levels

```bash
rp --level minimal   # fix typos only
rp --level standard  # default: clarify and structure
rp --level complete  # rigorous brief, flag missing info
```

## Providers

Reqraft supports multiple providers using native `fetch`:

- Anthropic
- OpenAI
- DeepSeek
- Mistral
- OpenAI Compatible (Ollama, LM Studio, gateways, etc.)

Set your API key in the environment:

```bash
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
export DEEPSEEK_API_KEY=...
export MISTRAL_API_KEY=...
```

Or store it in the system credential manager:

```bash
rp auth login openai
rp auth status
rp auth logout openai
```

Environment variables take precedence over stored credentials. macOS uses Keychain and Linux uses Secret Service; Windows currently uses environment variables.

## Configuration

```bash
rp init                    # first-run wizard
rp init --reset            # restart from defaults, with confirmation
rp config                    # show config
rp config get defaultProvider
rp config set defaultProvider openai
rp config path
rp config setup              # same as rp init
rp config setup --reset      # same as rp init --reset
```

`rp init` never stores API keys in `config.json`. When a key is missing, it recommends
`rp auth login <provider>` for secure system storage and also prints shell-specific
environment-variable instructions.

## Shell aliases

```bash
rp alias set p
rp alias set ask
rp alias list
rp alias remove p
```

## Security

Reqraft detects common secrets locally before sending text to a provider:

- GitHub tokens
- OpenAI / Anthropic API keys
- AWS credentials
- Private keys
- Variables named `SECRET`, `TOKEN`, `PASSWORD`, or `API_KEY`

If a secret is detected, the CLI stops and suggests `--redact-secrets` or `--force`.

See [SECURITY.md](SECURITY.md) and [docs/privacy.md](docs/privacy.md).

## Benchmark

```bash
pnpm benchmark
# or
pnpm exec tsx benchmark/runner.ts anthropic claude-haiku-4-5
```

Benchmarks are never run automatically because they consume API credits.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md).
Static analysis and coverage setup are documented in
[docs/code-quality.md](docs/code-quality.md).

## License

MIT
