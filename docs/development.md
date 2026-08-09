# Development

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm dev              # run from source
pnpm build            # bundle with tsup
pnpm test             # run Vitest
pnpm lint             # run ESLint
pnpm format           # run Prettier
pnpm typecheck        # run tsc --noEmit
pnpm quality          # local gate: typecheck, format check, lint, build, coverage
pnpm benchmark        # run benchmark
pnpm release          # push main, create the package version tag, push the tag
```

## Releasing

1. Update the version in `package.json` and `src/version.ts`.
2. Add the matching section to `CHANGELOG.md` and commit these changes on
   `main`.
3. Run `pnpm release`.

The release command requires a clean `main`, reads the version from
`package.json`, pushes `main`, creates and pushes the annotated version tag, then
creates the corresponding GitHub Release with generated notes. The existing
GitHub Actions workflow runs the quality gate and publishes the package to npm.
The command requires an authenticated GitHub CLI (`gh auth status`).

## Architecture

```text
src/
  cli.tsx             # entry point and command definitions
  opentui/            # interactive OpenTUI renderer
  application/        # use cases shared by CLI and TUI
  commands/           # command implementations
  core/               # engine, types, parser, prompt builder and policies
  profiles/           # profile definitions and registry
  providers/          # provider catalog, runtime resolver and API adapters
  models/             # model presets, capabilities and resolver
  config/             # config schema, loader, paths
  aliases/            # shell alias management
  clipboard/          # clipboard utilities
  ui/                 # renderer-agnostic state, actions, formatting and shortcuts
  utils/              # exit codes, input, redaction
```

The quick CLI path and the TUI must call the same application use case
(`executeReprompt`). UI-specific modules may prepare view state or component
props, but they must not duplicate provider selection, model capability rules or
reprompt policy.

`src/app.tsx` is a legacy renderer kept for now as historical fallback code.
The default interactive entry path launches `src/opentui/`.

## Adding a profile

1. Create `src/profiles/<id>.ts` exporting a `PromptProfile`.
2. Add it to `src/profiles/registry.ts`.
3. Add preservation/regression tests in `tests/unit/profiles.test.ts`.

## Adding a provider

1. Add the provider definition to `src/providers/catalog.ts`.
2. Create `src/providers/<id>.ts` implementing `ProviderAdapter`.
3. Register the adapter factory in `src/providers/registry.ts`.
4. Add model presets only in `src/models/presets.ts`.
5. Add catalog/runtime tests and integration tests in `tests/integration/providers.test.ts`.

Provider ids, labels, secure-auth eligibility and API-key environment variable
names must come from the catalog. Command modules must not redeclare provider
label or env maps.

## Tests

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

All tests must pass before a commit.

For quality-gated work, run:

```bash
pnpm quality
```

It chains type checking, the Prettier check, ESLint, the build and the
coverage run. Rules and documented exceptions live in
[docs/code-quality.md](code-quality.md).

The internationalisation feasibility assessment lives in
[docs/i18n-feasibility.md](i18n-feasibility.md).
