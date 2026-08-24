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
- Business modules never import from `src/apps/`; ESLint blocks that too.
  Terminal output helpers both sides need live in `src/shared/terminal/`.

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
- Before changing a UI component, layout primitive, renderer option, input
  behaviour or keyboard interaction, identify the UI technology used by that
  surface (OpenTUI for the interactive CLI, React/Electron for desktop, or
  another direct dependency). Consult the documentation for the exact
  component/API involved. Prefer project-local package types and sources
  first, then its official documentation when further context is needed. Use
  sound engineering judgement, reuse documented primitives or patterns rather
  than recreating them, and do not rely on undocumented behaviour.
- Keep product state, shortcuts, provider/model selection and formatting rules
  in the `src/apps/cli/ui/` modules when possible. Those modules stay free of
  any rendering surface — ESLint blocks `ink` and `@opentui/*` there.
- Controls that sit next to each other must be the same size. Geometry —
  height, padding, radius, font size, border box — is declared once on the base
  element; a variant class changes colour and weight only. A variant that sets
  its own padding or adds a border where its sibling has none produces a pair a
  few pixels apart, which is the first thing anyone notices. In the desktop
  renderer that base is the `button` rule in `renderer/shared/desktop.css`, and
  every variant (`.button-primary`, `.button-secondary`, `.chip`) carries a
  transparent border so adding a visible one never changes the height.
- Before reporting a UI change as done, render it and look at it — at the real
  window size, in the state the user will meet (empty, error, longest text).
  Measure what should align rather than trusting the code to have aligned it.
  Overlapping text, mismatched control sizes, ragged edges and an action below
  the fold are defects the author is expected to catch, not the reader.
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
