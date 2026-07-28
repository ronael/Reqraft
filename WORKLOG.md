# WORKLOG — Reqraft CLI

## Lot en cours

Lot D — Profils (terminé, prêt au commit).

## Terminé

### Lots précédents

- Lot A : initialisation.
- Lot B : domaine et moteur.
- Lot C : providers et modèles.

### Lot D

- Enrichissement des instructions des 7 profils (clean, code, frontend, web-design, debug, review, writing).
- Amélioration de la détection `auto` avec règles pondérées et plus de mots-clés.
- Architecture pour profils personnalisés via `parseCustomProfile` (frontmatter Markdown ou JSON, validé Zod).
- Tests de préservation et de non-invention (`profile-preservation.test.ts`).
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (25 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-d): enrich profiles and add preservation tests`.
- Passer au Lot E — CLI non interactif.

## Fichiers créés ou modifiés (Lot D)

- `src/profiles/clean.ts`
- `src/profiles/code.ts`
- `src/profiles/frontend.ts`
- `src/profiles/web-design.ts`
- `src/profiles/debug.ts`
- `src/profiles/review.ts`
- `src/profiles/writing.ts`
- `src/profiles/auto.ts`
- `src/profiles/custom.ts`
- `tests/unit/profile-preservation.test.ts`
- `WORKLOG.md`

## Commandes exécutées (Lot D)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (25 tests passés).

## Décisions techniques

- Instructions de profils explicites avec règles de préservation des termes techniques.
- Détection auto locale, sans appel IA.
- Format de profil personnalisé : Markdown frontmatter ou JSON, validé Zod.

## Prochaine action

Effectuer le commit du Lot D puis commencer le Lot E.
