# Security Policy

Reqraft is designed to be local-first and privacy-respecting. This document
describes the security model and how to report issues.

## Supported Versions

Only the latest published version is actively supported. Older versions may be
deprecated on npm when a fix changes security, privacy or provider behavior.

## Data Handling

- Prompts are not stored by Reqraft.
- Telemetry is disabled by default.
- API keys are read from environment variables or the system credential manager.
- API keys are never written to `config.json` or normal logs.
- Clipboard access happens only when requested with `--clipboard`, `--copy` or
  the equivalent interactive action.
- Provider calls are made directly from the local machine with native `fetch`.
  Reqraft does not proxy prompts through a Reqraft-operated server.

## Secret Detection

Before sending text to a provider, Reqraft runs a local pattern-based detector
for common secrets:

- GitHub tokens;
- OpenAI and Anthropic API keys;
- AWS credentials;
- private keys;
- variables named `SECRET`, `TOKEN`, `PASSWORD` or `API_KEY`.

If a potential secret is detected, non-interactive runs stop and ask the user to
use `--redact-secrets` or `--force`. Secret detection is best-effort and cannot
guarantee complete coverage.

## Reporting Security Issues

Please do not open a public issue for vulnerabilities that could expose user
data, credentials or supply-chain risk.

Use GitHub private vulnerability reporting if it is enabled for the repository.
If it is not available, contact the maintainer privately and include:

- affected version;
- operating system and Node.js version;
- reproduction steps;
- expected impact;
- whether any credential, prompt or package artifact may have been exposed.

Public issues are fine for non-sensitive hardening suggestions.
