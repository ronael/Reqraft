# WORKLOG — Reqraft CLI

## Lot en cours

Lot A — Initialisation du projet (terminé, prêt au commit).

## Terminé

- Création de la structure de dossiers complète.
- Configuration `package.json` avec les deux exécutables `rp` et `reprompt`.
- Installation des dépendances (pnpm).
- Configuration TypeScript strict (`tsconfig.json`) avec `jsx: react`.
- Configuration ESLint + Prettier.
- Configuration Vitest et tsup.
- Fichiers source initiaux : `cli.tsx`, `app.tsx`, `version.ts`, `core/types.ts`, `providers/mock.ts`.
- Test unitaire minimal (`tests/unit/version.test.ts`).
- CI GitHub minimale (Ubuntu/macOS/Windows, Node 20/22).
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build` réussies.
- Test manuel des binaires `node dist/cli.js --help`, `--version`, `"test"` réussi.

## Reste à faire

- Commit `feat(lot-a): initialize project foundation`.
- Passer au Lot B — Domaine et moteur.

## Fichiers créés ou modifiés

- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `prettier.config.mjs`
- `vitest.config.ts`
- `tsup.config.ts`
- `.gitignore`
- `.github/workflows/ci.yml`
- `src/cli.tsx`
- `src/app.tsx`
- `src/version.ts`
- `src/core/types.ts`
- `src/providers/mock.ts`
- `tests/unit/version.test.ts`
- `benchmark/runner.ts`
- `WORKLOG.md`

## Commandes exécutées

- `pnpm init`
- `mkdir -p ...`
- `pnpm install`
- `pnpm exec tsc --noEmit` ✓
- `pnpm lint` ✓
- `pnpm test` ✓ (1 test passé)
- `pnpm build` ✓
- `node dist/cli.js --help` ✓
- `node dist/cli.js --version` ✓
- `node dist/cli.js "test"` ✓

## Décisions techniques

- `jsx: react` plutôt que `react-jsx` pour éviter les conflits d'import React avec TypeScript strict.
- Le shebang est injecté par tsup via `banner.js` ; retiré du fichier source `cli.tsx` pour éviter le double shebang.
- Utilisation d'Ink 5.x avec React 18.x.

## Prochaine action

Effectuer le commit du Lot A puis commencer le Lot B.
