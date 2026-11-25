# Changelog

## Unreleased

### Desktop application

- Settings › AI agents puts Reqraft inside Codex and Claude Code: their
  Ctrl+G opens the draft in Reqraft, which rewrites it in place. The tab lists
  the agents found on the computer, enables one with a click, copies the line
  to paste yourself, or copies instructions your agent carries out. When the
  `rp` command is missing, it says so and gives the command to install it.
  Agents that cannot open an external editor are listed as not supported.
- People who already use the app see the news once, in the menu bar popover;
  new users meet it in the welcome tour, which gains a step.
- While the app is open, Ctrl+G in an agent shows the draft in the capsule:
  before and after, profile, level and a result to touch up. Replace sends it
  back to the agent and returns to the terminal; closing keeps the draft. With
  the app closed, or over SSH, the review stays in the terminal. Settings ›
  AI agents › Review chooses.
- A provider error in a desktop window points to Settings (Providers or
  Diagnostics) instead of suggesting `rp auth login` or `rp doctor`, which no
  window can run.

### Command line

- `rp agents` turns on Ctrl+G in Codex and Claude Code for zsh, bash, fish or
  PowerShell: it writes a marked block to the shell's start-up file, prints the
  lines to paste, or prints instructions for your agent. `--disable` removes
  the block and nothing else. `rp init` offers it at the end of the setup, and
  people who already use the CLI see a one-time tip after a rewrite.
- `rp edit <file>` is the editor those agents open. It rewrites the draft,
  shows before and after, and writes the result only when you keep it;
  cancelling or a failed rewrite gives the agent its draft back unchanged.

### Reliability and distribution

- Releases publish the desktop installers again while no signing certificate
  is configured, as the 0.6.4 release did. The release notes open with a
  warning that the macOS installer is unsigned and how to open it; a partial
  signing configuration still stops the release. The workflow can also rebuild
  the installers of a release that is already out (`-f tag=v0.6.5`).
- The platform table in the release notes no longer says that selection
  capture and reinjection are macOS-only: Windows has both since 0.6.5, though
  its installer has not yet been tested by hand on a clean machine.

## 0.6.5 (2026-11-16)

### Desktop application

- The shortcut capture first reads the selection through the accessibility API
  (Accessibility on macOS, UI Automation on Windows), without touching the
  clipboard. It only simulates `⌘C` / `Ctrl+C` when the application does not
  expose the selection, as Chromium and Electron apps often do.
- That copy now waits for the shortcut's keys to be released: macOS used to
  receive `⌘⌃C`, which most apps ignore, and Windows `Ctrl+Alt+C`, which typed
  `©` over the selection in Word. It waits up to 600 ms for slow apps, and puts
  back the whole clipboard (text, HTML, rich text, image), not only its text.
- When nothing can be captured but the clipboard holds text, the capsule offers
  that text instead of an empty field. Nothing is sent before the rewrite is
  requested, and the result is pasted back into the source application.
- A failed replacement brings the capsule back with the result instead of
  leaving it hidden. Two quick presses run a single capture, and the shortcut
  is ignored while the capsule has the keyboard.
- Added a direct-replace global shortcut (`⌘⌃⇧R` on macOS, `Ctrl+Alt+Shift+R`
  elsewhere): it captures the selection, reformulates it and replaces it as
  soon as the result is ready, without pressing ⏎. A result flagged for review,
  or a session the user took over during generation, stays in the capsule.
- The capsule and the popover now stay open when they lose the focus. A
  preference restores the previous behaviour and applies immediately.
- Errors are shown as sentences in every desktop window, never as raw
  technical text such as `ProviderError: Provider error 401`.
- A detected secret no longer stops the capsule or the popover with the
  command line's advice: they explain it in their own words and offer to
  redact the secret and continue.
- The capsule's "lower the level" key goes one level down (`⇧⇥`) and is not
  offered at minimal; it used to rerun at a higher level.
- The desktop keeps only the latest result of each window in memory, and the
  question asked before removing an endpoint follows the window's language.
- Added native Windows selection capture and replacement through a dedicated
  PowerShell/.NET bridge. Reqraft records the exact foreground window and
  brings it back before pasting, instead of attempting to launch macOS-only
  `osascript`.
- Fixed the Profiles tab, where Save stayed disabled after a validation message,
  and a failed save at the end of the welcome tour, which was silent.
- The renderer's Content-Security-Policy no longer allows inline styles.

### Command line

- Prompts holding a git SHA, a deep path or a GitHub URL are no longer refused
  as secrets: a bare AWS secret key must now stand alone, be exactly 40
  characters long and mix upper case, lower case and digits.
- The interactive TUI checks for secrets before sending, keeps a model when
  switching to an OpenAI-compatible endpoint, and no longer offers the test
  provider.
- `rp init`: a placeholder key in the environment no longer leaves the terminal
  in raw mode, invalid custom headers are asked again instead of aborting, the
  configuration is shown once, pressing Enter keeps the saved level and
  headers, `--reset` replaces an unreadable configuration, and a new local
  server is no longer offered a Claude model id.
- `rp init` puts the endpoint it configures first, so a new OpenAI-compatible
  endpoint is the one used; it used to be saved after the existing one and
  ignored.
- `rp alias set` and `rp alias remove` ask for confirmation before writing the
  shell configuration, give PowerShell its own reload command, recognise
  PowerShell on every platform, and no longer write `/.bashrc` when `HOME` is
  unset.
- `--redact-secrets` no longer loses text when two secret patterns overlap, and
  each secret is named once.
- `--json` reports a missing request or a refused secret in its JSON envelope,
  and `--diff --explain` keeps the explanation and the quality warnings.
- `rp auth login` exits with code 3 when a key is rejected, and a rejected
  OpenAI-compatible key no longer suggests a command that refuses that
  provider.

### Providers

- A base URL ending with `/` no longer produces `//chat/completions`.
- Listing models sends the same custom headers as generation.
- An empty streamed answer is reported as an empty result, not as a network
  failure.

### Reliability and distribution

- The website, the desktop profile picker and the French README no longer say
  that the `auto` profile is picked on the machine: the model picks it in the
  same request.
- Patched `shell-quote` and moved to zod 4.
- On Windows, the script that brings the source window back gets time to start
  on a slow machine, instead of being stopped before it can paste.
- `pnpm release` waits for green CI before tagging: the npm publications of
  0.6.2 and 0.6.4 had failed after their tag was pushed.
- The website links to the last release whose installers are online, and
  `pnpm site:sync` moves it once the installers are attached.
- Required signing and notarization credentials before a public macOS desktop
  release can publish installers.
- Expanded rewrite-instruction detection so model responses that delegate a
  requested correction instead of performing it are reliably flagged for
  review.
- Made cross-platform tests independent from the host shell, shortcut family
  and personal profile configuration, and covered the CLI and desktop flows
  that had no tests.
- Refined the download page spacing and responsive hero typography.

## 0.6.4 (2026-09-13)

### Desktop application

- Fixed global shortcut defaults and their visible labels on Windows and Linux:
  portable `Ctrl+Alt` combinations now replace the macOS-only Command family.
- Unified all desktop Settings selectors under Reqraft's custom, keyboard
  accessible component, avoiding platform-specific native menus.

## 0.6.0 (2026-09-03)

### Desktop application

- Added a complete English and French desktop experience, with automatic
  relaunch after a language change and direct return to the settings screen.
- Added a six-step first-launch welcome tour, available again from settings,
  while incomplete installations still open the configuration repair flow.
- Made providers, models, profiles, shortcuts and interface preferences
  manageable without using the CLI. Provider credentials remain confined to
  the main process and the system keychain.
- Added editable starting prompts and generated results in the capsule, plus
  editable popover results. Copy, replacement and comparison all use the text
  currently shown.
- Added a global popover shortcut, pinned comparison, reversible level
  navigation and temporary suspension and recovery of global shortcuts.
- Added actionable diagnostics, a sanitized copyable report, provider checks,
  model catalogue loading and visible update checks for both the desktop app
  and the npm package.
- Reworked settings, notifications, action buttons, scrollbars and compact
  result metadata around shared components. The capsule now adapts its height
  only at stable transitions and keeps feedback above its variable-height
  footer.

### CLI, TUI and fidelity

- Added versioned project context through `.reqraft/config.json` and
  `.reqraft/profiles/`. Project profiles are read-only, override personal
  profiles by identifier and cannot carry credentials or machine settings.
- Added searchable, bounded profile/provider/model pickers in the TUI while
  preserving keyboard focus and selection as catalogues grow.
- Added conservative detection of invented paths and commands, lost technical
  terms and structural inflation. The CLI, TUI and desktop expose the same
  structured quality findings.
- Improved fidelity benchmarks with profile-level comparison, a larger
  hand-written regression corpus and versioned scoring rules.

### Reliability

- Added renderer integration tests, real Electron E2E scenarios and a packaged
  macOS smoke test covering startup, persistent windows and global shortcuts.
- Kept the npm package isolated from Electron bundles and installers, with a
  dry-run release check that validates the exact published file list.
- Added a macOS manual release checklist for permissions, selection capture,
  replacement, clipboard preservation, language changes and update behavior.

The CLI is stable. The desktop application remains in beta: macOS is the
validated target, Windows and Linux installers remain experimental, and
automatic installation waits for signed distribution packages.

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
