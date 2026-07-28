# WORKLOG — Reqraft CLI

## Lot en cours

Lot C — Providers et modèles (terminé, prêt au commit).

## Terminé

### Lot A

- Initialisation complète du projet.
- Commit : `feat(lot-a): initialize project foundation`.

### Lot B

- Domaine et moteur : types, profils, niveaux, builder, parser, engine, mock.
- Commit : `feat(lot-b): implement reprompt engine`.

### Lot C

- Adaptateurs providers : OpenAI, Anthropic, DeepSeek, Mistral, OpenAI Compatible.
- Erreurs uniformisées (`ProviderError`, `raiseProviderError`).
- Presets de modèles avec `MODEL_PRESETS_UPDATED_AT = "2026-07-28"`.
- Résolution de modèles (`resolveModel`).
- Registre de providers (`createProvider`, `listProviders`).
- Commandes `rp providers` et `rp models` fonctionnelles.
- Tests d'intégration providers (mock fetch).
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (21 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-c): implement providers and model presets`.
- Passer au Lot D — Profils (enrichir les instructions et tests de non-invention/préservation).

## Fichiers créés ou modifiés (Lot C)

- `src/core/types.ts` (ajout `reasoningEffort`)
- `src/providers/anthropic.ts`
- `src/providers/deepseek.ts`
- `src/providers/errors.ts`
- `src/providers/mistral.ts`
- `src/providers/openai.ts`
- `src/providers/openai-compatible.ts`
- `src/providers/registry.ts`
- `src/models/presets.ts`
- `src/models/model-resolver.ts`
- `src/cli.tsx` (commandes providers/models)
- `tests/integration/providers.test.ts`
- `WORKLOG.md`

## Commandes exécutées (Lot C)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (21 tests passés).

## Décisions techniques

- Abstraction légère via `ProviderAdapter` et fetch natif (pas de SDK officiel).
- `OpenAICompatibleProvider` réutilisable pour DeepSeek, Mistral, endpoints locaux.
- `reasoning_effort: none` transmis pour les presets OpenAI concernés.
- Presets modifiables avec date de registry.

## Prochaine action

Effectuer le commit du Lot C puis commencer le Lot D.
