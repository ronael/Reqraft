# WORKLOG — Reqraft CLI

## Lot en cours

Lot J — Benchmark et documentation (terminé, prêt au commit).

## Terminé

### Lots précédents

- Lot A à I terminés et commités.

### Lot J

- Dataset de benchmark avec 46 cas couvrant code, frontend, web-design, debug, review, writing, prompts courts/long, fautes, mélange fr/en, blocs de code, chemins/commandes.
- Runner de benchmark avec rapports JSON et Markdown.
- Scoring heuristique (intention, termes, non-invention, clarté, profil).
- README.md complet en anglais.
- Documentation providers, profils, développement.
- Documentation française dans `docs/fr/`.
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE` (MIT).
- Exemples dans `examples/`.
- `pnpm benchmark` testé et fonctionnel (score moyen 0.94 avec mock).
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (46 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-j): add benchmark suite and documentation`.
- Passer au Lot K — Stabilisation.

## Fichiers créés ou modifiés (Lot J)

- `benchmark/cases/dataset.ts`
- `benchmark/scoring.ts`
- `benchmark/runner.ts`
- `README.md`
- `docs/providers.md`
- `docs/profiles.md`
- `docs/development.md`
- `docs/privacy.md`
- `docs/fr/README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `LICENSE`
- `examples/frontend.md`
- `examples/debug.md`
- `WORKLOG.md`

## Commandes exécutées (Lot J)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (46 tests passés).
- `pnpm benchmark` → score moyen 0.94 avec provider mock.

## Décisions techniques

- Benchmark local avec provider mock par défaut pour éviter les coûts API.
- Rapports datés dans `benchmark-results/`.
- README orienté utilisateur avec sections rapides.

## Prochaine action

Effectuer le commit du Lot J puis commencer le Lot K.
