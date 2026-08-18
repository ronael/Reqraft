# Code quality

Reqraft enforces quality locally, with no external service.

`eslint-plugin-sonarjs` runs the Sonar rule set inside ESLint, so a
maintainability or reliability issue fails on the developer's machine during
`pnpm lint`. The same rules light up in the editor through SonarLint.

The hosted SonarQube analysis was removed: its cost was not justified for a
project this size, and the rule findings it added over the local linter were
marginal. What was lost with it — coverage gating on new code, cross-file
duplication detection, and historical trends — is not currently replaced.

## Local quality suite

```bash
pnpm quality
```

Runs type checking, the Prettier check, ESLint, the production build, then all
tests with V8 coverage. Coverage is written to `coverage/lcov.info`.

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
- `sonarjs/no-os-command-from-path` in
  `tests/unit/npm-package-contents.test.ts`, on the `npm pack --dry-run`
  invocation. Same reasoning: `npm` has no stable absolute path across nvm,
  Volta, Homebrew and CI images. The check runs in tests only, on a fixed
  command literal with no interpolated input.

Any new suppression belongs in this list, with its reasoning.
