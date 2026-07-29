# SonarQube

Reqraft runs Sonar analysis at two levels, on purpose.

`eslint-plugin-sonarjs` runs the Sonar rule set locally, inside ESLint, so a
maintainability or reliability issue fails on the developer's machine during
`pnpm lint` instead of in CI. Its `recommended` config is enabled as-is in
`eslint.config.mjs`; no rule is disabled without a documented rationale in this
file.

SonarQube keeps what a local linter structurally cannot provide: coverage
measurement, the new-code quality gate, cross-file duplication detection, and
the historical trend across branches.

The two overlap on rule findings, and that is intended: ESLint is the fast
feedback loop, SonarQube is the gate of record.

## Rule set

`sonarjs.configs.recommended` enables 217 rules and leaves 62 off. Those 62 are
re-enabled in `eslint.config.mjs`, minus the exceptions below, so a smell the
preset would tolerate still fails the build.

`sonarjs/no-duplicate-string` is scoped to `src/`. Fixtures legitimately repeat
literals, and `sonar-project.properties` already separates test code through
`sonar.tests`.

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
- `sonarjs/file-header` — would require a license header in all 100 files. A
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

## Local quality suite

```bash
pnpm quality
```

This runs type checking, the Prettier check, ESLint, all tests with V8 coverage,
and the production build. Coverage is generated at `coverage/lcov.info`.

The first recorded repository-wide statement coverage is 42.74%. This is an
explicit baseline, not an acceptance target: the common reprompt core is above
92%, while the historical interactive TUI and command surfaces need dedicated
tests. SonarQube should enforce coverage on new code and track the baseline
upward instead of hiding untested production files.

## SonarQube configuration

The scanner reads `sonar-project.properties`. To run it:

```bash
export SONAR_TOKEN="..."
export SONAR_HOST_URL="https://sonarqube.example.com"
export SONAR_PROJECT_KEY="reqraft"
pnpm test:coverage
pnpm sonar
```

For SonarQube Cloud, omit `SONAR_HOST_URL` and also define
`SONAR_ORGANIZATION`. Never commit the token.

## GitHub Actions

The `SonarQube` workflow always executes the complete `pnpm quality` suite.
Scanning starts when `SONAR_TOKEN` is configured.

Repository configuration:

- secret `SONAR_TOKEN`;
- variable `SONAR_HOST_URL` for a self-hosted server;
- variable `SONAR_PROJECT_KEY` when it differs from `reqraft`;
- variable `SONAR_ORGANIZATION` for SonarQube Cloud.

Community Build analyzes the main branch but does not support pull-request
analysis. Set `SONAR_PR_ANALYSIS=true` only with SonarQube Cloud or a SonarQube
Server edition that supports it. The scanner waits for the quality gate and
fails the workflow when the gate fails.
