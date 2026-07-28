# Contributing to Reqraft

Thank you for your interest in contributing!

## How to contribute

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Ensure `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, and `pnpm build` pass.
5. Open a pull request.

## Code style

- TypeScript strict mode.
- ESLint and Prettier are enforced.
- Prefer explicit types over `any`.
- Keep commits focused and well-described.

## Tests

Add tests for new features and bug fixes. E2E tests should not require real API keys; use the `mock` provider.

## Reporting issues

Use GitHub issues with a clear description, reproduction steps, and environment details.
