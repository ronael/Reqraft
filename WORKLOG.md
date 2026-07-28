# WORKLOG — Reqraft CLI

## Lot en cours

Lot H — Alias shell (terminé, prêt au commit).

## Terminé

### Lots précédents

- Lot A à G terminés et commités.

### Lot H

- Détection du shell (Bash, Zsh, Fish, PowerShell).
- Handlers par shell pour formater et parser les alias.
- Manager d'alias avec set/remove/list sécurisés.
- Blocs délimités pour ne jamais toucher au contenu externe.
- Mode `--dry-run`.
- Détection des collisions et alias invalides/dangereux.
- Commande `rp alias set|remove|list`.
- Tests sur fichiers temporaires.
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (41 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-h): implement shell alias management`.
- Passer au Lot I — Confidentialité et sécurité.

## Fichiers créés ou modifiés (Lot H)

- `src/aliases/detector.ts`
- `src/aliases/manager.ts`
- `src/aliases/shells/types.ts`
- `src/aliases/shells/bash.ts`
- `src/aliases/shells/zsh.ts`
- `src/aliases/shells/fish.ts`
- `src/aliases/shells/powershell.ts`
- `src/commands/aliases.ts`
- `src/cli.tsx` (commande alias)
- `tests/unit/aliases.test.ts`
- `WORKLOG.md`

## Commandes exécutées (Lot H)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (41 tests passés).

## Décisions techniques

- Blocs `# >>> rp aliases >>>` / `# <<< rp aliases <<<` pour isoler les modifications.
- Confirmation interactive avant modification d'un fichier de profil shell.
- Alias invalides rejetés (caractères spéciaux, noms réservés).

## Prochaine action

Effectuer le commit du Lot H puis commencer le Lot I.
