# Project Notes For Agents

## Structure

```
src/
├── apps/
│   ├── cli/          CLI + TUI: cli.tsx, cli-program.ts, commands/, ui/,
│   │                 opentui/, aliases/, presentation/, clipboard/
│   └── desktop/      Electron: main/, preload/, renderer/, shared/
├── shared/           contracts both apps use (errors, palette values)
├── core/             engine, prompt building, result parsing, types
├── providers/        AI connections
├── profiles/         rewriting profiles
├── config/  i18n/  models/  auth/  application/  capabilities/  utils/
└── version.ts
```

`src/apps/` holds the two shipped applications; everything else in `src/` is
business logic both of them consume.

## Boundaries

- CLI-only code goes in `src/apps/cli/`, desktop-only code in
  `src/apps/desktop/`. Anything both need belongs to a root module, or to
  `src/shared/` when it is a small contract rather than business logic.
- The two apps never import each other. ESLint blocks it in both directions —
  if you reach for the other app, the code you want is in the wrong place.
- Business modules should not import from `src/apps/`. One violation predates
  the restructure — `src/auth/credentials.ts` pulls `printScreen` from
  `@/apps/cli/ui/text.js` — and is not a precedent to follow: it needs the
  helper moved to `src/shared/` before that dependency can be removed.

## Imports

- Cross-directory imports use the `@/*` alias, which maps to `src/*`:
  `import { rewrite } from "@/core/engine.js"`. Keep `./sibling.js` relative
  inside a directory, but do not write deep relative paths like
  `../../../core/engine.js`.
- The alias is declared in `tsconfig.json` and mirrored in `vitest.config.ts`
  and `vite.desktop.config.ts` (Vite does not read `tsconfig.paths`). Adding a
  new alias means updating all three.

## UI

- The interactive CLI uses OpenTUI through `src/apps/cli/opentui/`.
- Keep product state, shortcuts, provider/model selection and formatting rules
  in the `src/apps/cli/ui/` modules when possible. Those modules stay free of
  any rendering surface — ESLint blocks `ink` and `@opentui/*` there.
- Do not introduce a component registry without an explicit product decision.
- Prefer existing OpenTUI wrappers such as `ScrollView` and `TextViewport`
  before adding a custom terminal primitive.
- Non-interactive commands stay in `src/apps/cli/commands/` and must keep clean
  stdout/stderr behavior.

## Desktop (Electron)

- The desktop app lives in `src/apps/desktop/` (`main/`, `preload/`,
  `renderer/`, `shared/`) and shares the engine through direct source imports —
  never duplicate business logic there.
- The renderer never imports `@/core/`, `@/providers/`, `@/auth/` or
  `@/application/`; everything goes through the IPC contract, defined in
  the single file `src/apps/desktop/shared/ipc-channels.ts`. New channels are
  added there only, with a Zod schema in `ipc-contract.ts`.
- Feature parity across CLI/TUI/desktop is enforced by the capability registry
  in `src/capabilities/registry.ts`. The per-surface adapters that read it live
  in `tests/parity/`, driven by `tests/unit/capabilities.test.ts`.
- Reference doc: `docs/internal/DESKTOP.md`; work journal:
  `docs/internal/WORKLOG.md` (both git-ignored, local).

## Builds

- CLI builds to `dist/`, which is what the npm package publishes.
- Desktop builds to `release/desktop/` and must never write into `dist/` —
  `tests/unit/npm-package-contents.test.ts` fails if an Electron artefact
  reaches the package.
