<p align="center">
  <img src="https://ronael.github.io/Reqraft/docs/assets/reqraft-readme.png" alt="Reqraft — Shape the request. Keep the intent." width="100%" />
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
rp init
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
pnpm setup  # once, if pnpm has not configured its global bin directory yet
pnpm add -g @reqraft/cli
```

After `pnpm setup`, restart the terminal before running the global installation.

Two commands are provided and point to the same program:

```bash
rp "your request"
reprompt "your request"
```

Then run the guided setup and verify the resulting configuration:

```bash
rp init
rp auth login openai  # only when the selected provider key is not already in the environment
rp doctor
rp
```

`rp init` chooses the provider, model, profile, level and local preferences.
Replace `openai` in the authentication command with the provider selected during
setup. The final `rp` command opens the interactive interface.

To start the wizard again from its defaults, use `rp init --reset`.

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

### Read from clipboard

```bash
rp --clipboard
```

### Structured JSON output

```bash
rp "your request" --json
```

Starting with `0.2.0`, JSON uses a locale-neutral, versioned envelope:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "result": {}
}
```

Failures use the same envelope with `ok: false` and a stable error `code`,
optional `params`, and numeric `exitCode`. Human-readable translated messages
are intentionally excluded so scripts receive the same JSON in every UI locale.

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

| Profile      | Use case                                 |
| ------------ | ---------------------------------------- |
| `auto`       | The model picks the best-fitting profile |
| `clean`      | Grammar and light clarification          |
| `code`       | Developer agents                         |
| `frontend`   | Frontend implementation                  |
| `web-design` | Visual design and landing pages          |
| `debug`      | Bugs and errors                          |
| `review`     | Code audits and reviews                  |
| `writing`    | Emails, messages, documents              |

### Local profiles

The table above lists the **built-in** profiles, which ship with Reqraft and are
never modified. Alongside them you can keep as many **local** profiles as you
like — one JSON file each, in Reqraft's profile directory. Both kinds work the
same way with `--profile <id>` and both appear in the TUI picker, grouped by
origin so you always know which is which.

```bash
rp profiles                       # list built-in and local profiles
rp profiles add                   # create one, guided
rp profiles add --file ./sav.reqraft-profile.json # import one, strictly validated
rp profiles edit sav              # change a local profile
rp profiles duplicate clean sav   # copy any profile into a new local one
rp profiles export sav            # print a portable JSON document
rp profiles remove sav            # delete a local profile, after confirmation
```

`add` asks for a name and suggests an id derived from it, which you can accept
with Enter or replace. It then asks for a description, an optional built-in base
to inherit from, the default level and the instructions.

Only local profiles can be edited or removed. A built-in profile is not a
restriction to work around — `duplicate` gives you an editable copy of it:

```bash
rp profiles duplicate writing ton-maison --name "Ton maison"
rp profiles edit ton-maison
rp --profile ton-maison "réécris ce message"
```

Duplicating a built-in copies its instructions into the new file, so the copy
stays standalone: it keeps working even if the built-in it came from later
changes.

`export` writes the document to standard output, so notes and warnings go to
standard error and a redirect captures JSON and nothing else:

```bash
rp profiles export ton-maison > ton-maison.reqraft-profile.json
rp profiles export ton-maison --output ./ton-maison.reqraft-profile.json   # or write it directly
```

Exporting a **built-in** renames it — `clean` becomes `clean-copy` — because the
format refuses built-in ids. Without the rename the file would export cleanly
and fail on import. Pass `--as <id>` to choose the id yourself:

```bash
rp profiles export clean --as ma-base > ma-base.reqraft-profile.json
rp profiles add --file ./ma-base.reqraft-profile.json
```

A local profile may inherit from one built-in profile through `extends`. The
parent's instructions come first, yours follow, and your default level is kept:

```json
{
  "schemaVersion": 1,
  "id": "sav",
  "name": "Support client",
  "description": "Reformule les réponses du support.",
  "extends": "clean",
  "defaultLevel": "standard",
  "instructions": "Réponds avec empathie, précision et une action claire."
}
```

Import is strict: an unknown field, a missing one or an id that collides with a
built-in profile is refused with a message naming the problem, rather than being
silently ignored.

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

On macOS and Linux, the recommended option is the system credential manager:

```bash
rp auth login openai
rp auth status
rp auth logout openai
```

macOS uses Keychain and Linux uses Secret Service. Windows currently uses environment variables.

Environment variables remain available for CI, containers and unsupported credential stores:

```bash
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
export DEEPSEEK_API_KEY=...
export MISTRAL_API_KEY=...
```

Environment variables take precedence over stored credentials.

## Configuration

```bash
rp init                      # recommended first-run wizard
rp init --reset              # restart from defaults, with confirmation
rp config                    # show config
rp config get defaultProvider
rp config set defaultProvider openai
rp config path
rp config setup              # compatibility alias for rp init
rp config setup --reset      # compatibility alias for rp init --reset
rp doctor                    # verify config, keys and provider readiness
```

## Language

Reqraft supports English and French for both the quick CLI and the interactive
terminal UI. Automatic detection uses the terminal locale and falls back to
English. Override it for one command or persist the preference:

```bash
rp --ui-locale fr "corrige ce texte"
rp --ui-locale en --help
rp config set uiLocale fr    # auto, en, or fr
```

For CI or temporary shell configuration, use `REQRAFT_UI_LOCALE=en` or
`REQRAFT_UI_LOCALE=fr`.

The generated prompt language is independent from the interface language.
`auto` preserves the input language; an explicit value asks the provider for a
specific output language:

```bash
rp "rewrite this request" --output-language fr
rp config set outputLanguage auto
```

Changing `uiLocale` never changes the machine-readable JSON contract or the
requested output language.

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
Release automation is documented in [docs/development.md](docs/development.md),
and the UI/output language strategy in
[docs/i18n-feasibility.md](docs/i18n-feasibility.md).

## License

MIT
