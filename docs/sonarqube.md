# SonarQube

Reqraft uses ESLint for immediate local TypeScript rules and SonarQube for
repository-level maintainability, reliability, security and coverage analysis.
They are complementary checks.

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
