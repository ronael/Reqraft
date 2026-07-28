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
pnpm benchmark        # run benchmark
```

## Architecture

```text
src/
  cli.tsx           # entry point and command definitions
  app.tsx           # interactive TUI
  commands/         # command implementations
  core/             # engine, types, parser, prompt builder
  profiles/         # profile definitions and registry
  providers/        # provider adapters
  models/           # model presets and resolver
  config/           # config schema, loader, paths
  aliases/          # shell alias management
  clipboard/        # clipboard utilities
  ui/               # TUI components and hooks
  utils/            # exit codes, input, redaction
```

## Adding a profile

1. Create `src/profiles/<id>.ts` exporting a `PromptProfile`.
2. Add it to `src/profiles/registry.ts`.
3. Add preservation/regression tests in `tests/unit/profiles.test.ts`.

## Adding a provider

1. Create `src/providers/<id>.ts` implementing `ProviderAdapter`.
2. Add it to `src/providers/registry.ts`.
3. Add integration tests in `tests/integration/providers.test.ts`.

## Tests

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

All tests must pass before a commit.
