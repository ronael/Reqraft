# Code quality

Reqraft enforces quality locally: every check on this page runs without an
external service.

`eslint-plugin-sonarjs` runs the Sonar rule set inside ESLint, so a
maintainability or reliability issue fails on the developer's machine during
`pnpm lint`. The same rules light up in the editor through SonarLint.

The hosted SonarQube analysis was removed: its cost was not justified for a
project this size. The maintainer now analyses `main` with a self-hosted
SonarQube Community Build, which brings back what went with it: coverage gating
on new code, cross-file duplication detection and historical trends. The server
runs the same Sonar rules, plus a few the local linter cannot load: the
accessibility rules SonarJS builds on `eslint-plugin-jsx-a11y`, and the HTML
analyzer. Its settings live outside the repository; what they change from the
defaults is listed at the end of this page.

## Local quality suite

```bash
pnpm quality
```

Runs type checking, the Prettier check, ESLint, the production build, then all
tests with V8 coverage. Coverage is written to `coverage/lcov.info`.

Coverage leaves out what Vitest cannot run: the CLI entry point, the generated
version file, the Electron main entry point and the preload bridge, and the e2e
probes the main process runs only when `tests/e2e/desktop.test.ts` starts it.
That suite drives the Electron code in the real app, where no coverage is
collected. `vitest.config.ts` lists these files.

The build runs before the tests on purpose: the end-to-end suite spawns
`dist/cli.js`, so a stale or missing bundle would fail it.

The first recorded repository-wide statement coverage is 42.74%. This is an
explicit baseline, not an acceptance target: the reprompt core is above 92%,
while the interactive TUI and command surfaces still need dedicated tests.

## Rule set

`sonarjs.configs.recommended` enables 217 rules and leaves 62 off. Those 62 are
re-enabled in `eslint.config.mjs`, minus the exceptions below, so a smell the
preset would tolerate still fails the build. That is 272 active rules.

`sonarjs/no-duplicate-string` is scoped to `src/`. Fixtures legitimately repeat
literals.

## Tolerated rules

Listed in `TOLERATED_SONAR_RULES` in `eslint.config.mjs`. Nothing is added here
without a reason:

- `sonarjs/cyclomatic-complexity` — redundant with `sonarjs/cognitive-complexity`,
  already enforced at 15 and passing everywhere. The five functions it flagged
  draw their score from `??` and `?.`, not from control flow: `runReprompt` has
  eight `??` for two `if`. Satisfying the metric would mean deleting null-safety
  fallbacks. SonarSource introduced Cognitive Complexity precisely because
  Cyclomatic Complexity misreads readability, which is why the preset ships this
  rule off.
- `sonarjs/no-undefined-assignment` — asks for `null` instead of `undefined`.
  The codebase models absence with optional properties, the TypeScript idiom;
  `null` would widen the types for no gain.
- `sonarjs/max-union-size` — caps unions at three members. `RepromptLevel` alone
  has three, and discriminated unions are how the domain is typed.
- `sonarjs/no-reference-error` — reports `console`, `setTimeout`, `NodeJS` and
  `AbortSignal` as undeclared. The flat config declares no globals; TypeScript
  already rejects genuinely undefined references.
- `sonarjs/file-header` — would require a license header in every file. A
  convention the project has not adopted, not a smell.
- `sonarjs/arrow-function-convention` and `sonarjs/shorthand-property-grouping` —
  formatting opinions that collide with Prettier, which owns style here.

## Suppressed call sites

- `sonarjs/no-os-command-from-path` in `src/auth/credentials.ts`, on the
  `secret-tool` invocation. The Secret Service CLI has no stable absolute path
  across distributions, Nix and Homebrew, so pinning one would break legitimate
  installs. It would also add no security boundary, since `rp` is itself
  resolved from the same `PATH`. The command name is a fixed literal.

Any new suppression belongs in this list, with its reasoning.

## SonarQube server settings

The server reads two coverage reports: Vitest's, and Bun's for `tests/tui`,
which only runs under Bun. The two runners count lines differently, so Bun's
hits are counted on the lines Vitest counts. Merged as they were, Bun's extra
lines showed the core about 21 % covered where Vitest measures 94 %.

Duplication detection skips the translation catalogues (`src/i18n/*/en.ts`,
`src/i18n/*/fr.ts`) and the benchmark corpora (`benchmark/cases/dataset.ts`,
`benchmark/fidelity-cases.ts`). Every language repeats the same keys and every
benchmark case the same record shape: the repetition is the data. These files
held 2,003 of the 2,344 duplicated lines the first analysis reported.

The analysis ignores these rules, on these files only:

- `typescript:S9379` (autoFocus) in `src/apps/desktop/renderer/capsule/App.tsx`
  and `src/apps/desktop/renderer/popover/PopoverApp.tsx`. These windows open on
  the user's global shortcut to take text at once: focusing their only field is
  their purpose. Focusing it through a ref would hide the same behaviour from
  the rule.
- `typescript:S6853` (label text) in
  `src/apps/desktop/renderer/onboarding/OnboardingApp.tsx`. The labels carry
  visible text three levels down (label, `.onboarding-label`,
  `.onboarding-label-title`), past the two levels the rule inspects. The inputs
  take their accessible names from these labels.
