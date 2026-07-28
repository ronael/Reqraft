# Security Policy

Reqraft is designed to be local-first and privacy-respecting. This document describes the security model and how to report issues.

## Data Handling

- Prompts are never stored by default.
- No telemetry is sent unless explicitly enabled.
- API keys are read from environment variables and are never written to `config.json` or logs.
- Before sending text to a provider, Reqraft runs a local secret detector for common patterns:
  - GitHub tokens
  - OpenAI / Anthropic API keys
  - AWS credentials
  - Private keys
  - Variables named `SECRET`, `TOKEN`, `PASSWORD`, or `API_KEY`

## Secret Detection

If a potential secret is detected, the CLI stops and asks the user to:

- continue with `--force`,
- automatically redact with `--redact-secrets`,
- or cancel.

Secret detection is pattern-based and local; it cannot guarantee 100% coverage.

## Reporting Security Issues

Please open an issue on the project repository with the label `security` or contact the maintainers privately.
