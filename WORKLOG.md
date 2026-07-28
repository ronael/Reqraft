# WORKLOG — Reqraft CLI

## Lot en cours

Lot E — CLI non interactif (terminé, prêt au commit).

## Terminé

### Lots précédents

- Lot A à D terminés et commités.

### Lot E

- Commande non interactive complète (`src/commands/reprompt.ts`).
- Support des entrées : argument, stdin, fichier (`--file`), presse-papiers (`--clipboard`).
- Support des sorties : texte brut, JSON (`--json`), diff (`--diff`), explication (`--explain`).
- Copie dans le presse-papiers (`--copy`).
- Gestion des profils, niveaux, providers et modèles.
- Codes de sortie normalisés (`src/utils/exit-codes.ts`).
- Gestion des erreurs avec messages clairs et mode verbose.
- Tests E2E du CLI (`tests/e2e/cli.test.ts`).
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (29 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-e): implement non-interactive CLI`.
- Passer au Lot F — Configuration.

## Fichiers créés ou modifiés (Lot E)

- `src/cli.tsx`
- `src/commands/reprompt.ts`
- `src/clipboard/clipboard.ts`
- `src/utils/input.ts`
- `src/utils/exit-codes.ts`
- `src/core/engine.ts` (ajout `reasoningEffort`)
- `tests/e2e/cli.test.ts`
- `WORKLOG.md`

## Commandes exécutées (Lot E)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (29 tests passés).
- `node dist/cli.js "..." --provider mock --verbose` → fonctionne.
- `echo "..." | node dist/cli.js --provider mock --json` → fonctionne.
- `node dist/cli.js --file /tmp/demande.txt --provider mock` → fonctionne.

## Décisions techniques

- `runReprompt` orchestre la résolution d'entrée, le profil, le provider, le modèle et la sortie.
- Utilisation de `clipboardy` pour le presse-papiers cross-platform.
- Codes de sortie explicites selon le plan.
- Diff simple ligne par ligne.

## Prochaine action

Effectuer le commit du Lot E puis commencer le Lot F.
