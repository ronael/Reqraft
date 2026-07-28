# WORKLOG — Reqraft CLI

## Lot en cours

Lot I — Confidentialité et sécurité (terminé, prêt au commit).

## Terminé

### Lots précédents

- Lot A à H terminés et commités.

### Lot I

- Détecteur local de secrets (`src/core/secret-detector.ts`).
- Redaction optionnelle (`src/utils/redaction.ts`).
- Intégration dans `runReprompt` avec `--force` et `--redact-secrets`.
- Aucun historique de prompts, pas de télémétrie par défaut.
- Clés API jamais écrites dans config/logs.
- Fichier `SECURITY.md`.
- Documentation `docs/privacy.md`.
- Tests de détection et de redaction.
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (46 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-i): add secret detection and privacy docs`.
- Passer au Lot J — Benchmark et documentation.

## Fichiers créés ou modifiés (Lot I)

- `src/core/secret-detector.ts`
- `src/utils/redaction.ts`
- `src/commands/reprompt.ts`
- `src/cli.tsx` (options --force, --redact-secrets)
- `tests/unit/secret-detector.test.ts`
- `SECURITY.md`
- `docs/privacy.md`
- `WORKLOG.md`

## Commandes exécutées (Lot I)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (46 tests passés).

## Décisions techniques

- Patterns regex locaux pour GitHub, OpenAI, Anthropic, AWS, clés privées, variables sensibles.
- Arrêt avec code de sortie 6 en cas de secret détecté en mode non interactif.
- `--redact-secrets` remplace les valeurs par `[REDACTED]`.

## Prochaine action

Effectuer le commit du Lot I puis commencer le Lot J.
