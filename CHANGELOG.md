# Changelog

## 0.3.1 (2026-08-20)

- Fixed the desktop application failing to start. The main process left `zod`
  as a bare import while the packaged app ships no `node_modules`, so every
  0.3.0 installer died on launch with `ERR_MODULE_NOT_FOUND`. All three
  platforms were affected. Dependencies are now bundled into the main process,
  and a test asserts on the built artifact so the two configurations cannot
  disagree again.
- Dimmed the background behind dialogs and let the prompt surface move focus to
  the editor.

## 0.3.0 (2026-08-19)

### New OpenTUI interface (UI V2)

- Rebuilt the terminal interface on a vertical, conversational composition: a
  header, a scrollable transcript of turns, the prompt editor and a status bar,
  replacing the previous panel layout.
- Replaced the hand-rolled input with a real OpenTUI textarea, externally
  synchronisable so the screen and the editor never disagree about the prompt.
- Rendered the transcript through OpenTUI's native scroll box, sticking to the
  latest turn while a response streams in.
- Streamed model output into the transcript as it arrives, decoding the
  structured envelope so the raw JSON never reaches the screen.
- Added overlays for the profile, level, provider and model pickers, a command
  palette and a help screen, all rendered through one modal primitive that
  floats above the layout instead of displacing it.
- Centralised every shortcut in a single command registry, so the status bar,
  the palette, the help screen and the key handler cannot drift apart. Control
  keys the terminal collapses to editing keys are refused outright.
- Added a focus model with Tab/Shift+Tab traversal between the editor and the
  transcript, suspended while an overlay is open.
- Made the layout responsive: metadata, then columns, then the status bar are
  dropped as the terminal shrinks, and a dedicated screen replaces the interface
  below the usable minimum. The editor is never reduced.
- Added toasts for confirmations, typed error states and a waiting indicator.
- Retired the previous TUI implementation, now unreachable.

### Fixes

- Parsed the first complete JSON object out of a response, so an answer followed
  by extra prose is no longer lost.
- Destroyed the renderer on exit rather than stopping it, so the terminal is
  released and the process ends.
- Sized the editor to its wrapped content, so a long prompt no longer pushed the
  surface title out of its frame.

### Tests

- Added renderer-level tests asserting on the rendered character grid, covering
  frame integrity, overlay placement and status bar legibility across terminal
  sizes and both locales.
- Drove the interaction tests through real OpenTUI key events, with renderer
  teardown between tests and Bun pinned in CI.

## 0.2.1 (2026-08-18)

- Separated the source tree into `src/apps/cli`, `src/apps/desktop` and
  `src/shared`, with a `@/*` import alias and lint rules enforcing the boundary.
- Added an Electron desktop application for macOS: capsule window, menu-bar tray
  with a popover surface, a settings window, typed IPC and selection capture.
- Packaged the desktop application with electron-builder, adding multi-platform
  installer targets and a release workflow; Windows and Linux builds are marked
  experimental.
- Isolated desktop build artifacts from the npm package, so Electron output can
  no longer reach `@reqraft/cli`.
- Added a capability registry shared across the CLI and TUI surfaces.
- Added automatic profile detection with benchmark scoring, and aligned the
  desktop flow with it.
- Fixed `resolveProfile` so it no longer requires input text.

## 0.2.0 (2026-08-10)

- Added complete English and French localisation for the CLI, setup, operational commands and OpenTUI.
- Added `--ui-locale`, `REQRAFT_UI_LOCALE` and the persistent `uiLocale` setting with automatic system-locale detection.
- Added independent `--output-language` and `outputLanguage` controls; `auto` continues to preserve the input language.
- Replaced translated core diagnostics and expected failures with stable codes and typed parameters.
- Versioned `--json` with `schemaVersion: 1` success/error envelopes that do not vary with the UI locale.
- Removed the unreachable legacy Ink renderer and its dependencies after the OpenTUI migration.

### Breaking change

`--json` no longer serialises `RepromptResult` directly. Consumers must read the
result from `result` when `ok` is `true`, or the stable error from `error` when
`ok` is `false`. The former top-level result `warnings` field has been replaced
by structured `result.quality.signals`.

## 0.1.5 (2026-08-09)

- Refined the interactive setup hierarchy with clearer choices, prompts and status feedback.
- Added terminal-aware colours and Unicode symbols with clean fallbacks for pipes and limited terminals.
- Improved API key instructions and the final configuration summary.

## 0.1.4 (2026-08-09)

- Improved the native terminal experience and its visual presentation.
- Fixed clipboard write validation for `--copy`.
- Refined the public documentation, landing page and alpha messaging.
- Updated GitHub Actions to current Node runtimes.

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
