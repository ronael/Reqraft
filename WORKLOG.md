# WORKLOG — Reqraft CLI

## Lot en cours

Lot B — Domaine et moteur (terminé, prêt au commit).

## Terminé

### Lot A

- Initialisation complète du projet.
- Commit : `feat(lot-a): initialize project foundation`.

### Lot B

- Types du domaine (`src/core/types.ts`).
- Système de profils : base, registry, auto-détection, et 7 profils basiques (clean, code, frontend, web-design, debug, review, writing).
- Niveaux de transformation (`src/core/levels.ts`).
- Builder de prompts (`src/core/prompt-builder.ts`).
- Parser de résultats structurés avec fallback (`src/core/result-parser.ts`).
- Moteur de reformulation (`src/core/engine.ts`).
- Provider mock amélioré.
- Tests unitaires : profiles, result-parser, engine.
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (16 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-b): implement reprompt engine`.
- Passer au Lot C — Providers et modèles.

## Fichiers créés ou modifiés (Lot B)

- `src/core/engine.ts`
- `src/core/levels.ts`
- `src/core/prompt-builder.ts`
- `src/core/result-parser.ts`
- `src/profiles/auto.ts`
- `src/profiles/base.ts`
- `src/profiles/clean.ts`
- `src/profiles/code.ts`
- `src/profiles/debug.ts`
- `src/profiles/frontend.ts`
- `src/profiles/registry.ts`
- `src/profiles/review.ts`
- `src/profiles/types.ts`
- `src/profiles/web-design.ts`
- `src/profiles/writing.ts`
- `src/providers/mock.ts`
- `tests/unit/engine.test.ts`
- `tests/unit/profiles.test.ts`
- `tests/unit/result-parser.test.ts`
- `WORKLOG.md`

## Commandes exécutées (Lot B)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (16 tests passés).

## Décisions techniques

- Architecture profil indépendante avec `PromptProfile` et registre.
- Détection locale par mots-clés (pas d'appel IA).
- Parser robuste avec suppression des fences Markdown et fallback JSON.
- Moteur isolé, testable avec provider mock.

## Prochaine action

Effectuer le commit du Lot B puis commencer le Lot C.
