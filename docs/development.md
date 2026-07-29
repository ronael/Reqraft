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
pnpm quality          # local gate: typecheck, format check, lint, build, coverage, sonar
pnpm sonar            # SonarQube scan; reads SONAR_* from shell or .env
pnpm benchmark        # run benchmark
```

## Architecture

```text
src/
  cli.tsx             # entry point and command definitions
  app.tsx             # thin interactive TUI composition
  application/        # use cases shared by CLI and TUI
  commands/           # command implementations
  core/               # engine, types, parser, prompt builder and policies
  profiles/           # profile definitions and registry
  providers/          # provider catalog, runtime resolver and API adapters
  models/             # model presets, capabilities and resolver
  config/             # config schema, loader, paths
  aliases/            # shell alias management
  clipboard/          # clipboard utilities
  ui/                 # TUI state, actions, rendering helpers, components and hooks
  utils/              # exit codes, input, redaction
```

The quick CLI path and the TUI must call the same application use case
(`executeReprompt`). UI-specific modules may prepare view state or component
props, but they must not duplicate provider selection, model capability rules or
reprompt policy.

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
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
pnpm sonar
pnpm quality
```

`pnpm sonar` reads Sonar variables from the shell first, then from `.env`.
It intentionally fails when no `SONAR_TOKEN` is available, and SonarQube Cloud
also requires `SONAR_ORGANIZATION` when no `SONAR_HOST_URL` is configured.
Those failures are missing local prerequisites, not code failures; CI should
provide the variables when the Sonar gate is expected to run.
