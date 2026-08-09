# Changelog

## 0.1.3 (2026-08-09)

- Aligned the published package metadata, repository links and CLI version output.
- Hardened release provenance and GitHub Actions permissions.
- Updated development-only vulnerable dependency ranges and verified the npm package contents.
- Documented the supported security model and vulnerability reporting path.

## 0.1.2 (2026-08-08)

- Migrated the main interactive experience to OpenTUI.
- Added streaming output, scrollable result/input panels, paste support and native Ctrl+C shutdown.
- Aligned quick CLI provider/model fallback with the interactive UI.
- Hardened secure credential handling and first-run setup messaging.
- Added local quality gates with TypeScript, Prettier, ESLint/SonarJS, build and coverage.

## 0.1.1 (2026-07-29)

- Stabilized provider contracts and model parameter handling.
- Added fidelity benchmarks for supported providers.
- Improved stats output and quality diagnostics.

## 0.1.0 (2026-07-28)

Initial release.

- CLI commands: `rp`, `reprompt`, `profiles`, `providers`, `models`, `config`, `alias`, `doctor`, `version`.
- Interactive TUI with keyboard shortcuts.
- Profiles: auto, clean, code, frontend, web-design, debug, review, writing.
- Levels: minimal, standard, complete.
- Providers: Anthropic, OpenAI, DeepSeek, Mistral, OpenAI Compatible, mock.
- Model presets and first-run setup wizard.
- Shell alias management for Bash, Zsh, Fish, PowerShell.
- Local secret detection and optional redaction.
- Benchmark suite with 40+ cases.
- Multi-platform configuration paths (XDG on Linux, macOS, Windows).
