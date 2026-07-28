# WORKLOG — Reqraft CLI

## Lot en cours

Lot G — TUI (terminé, prêt au commit).

## Terminé

### Lots précédents

- Lot A à F terminés et commités.

### Lot G

- TUI interactive complète dans `src/app.tsx`.
- Éditeur de prompt avec `ink-text-input`.
- Affichage du profil actif, niveau, provider, modèle.
- Affichage du résultat, diff, explication.
- Modales de sélection pour profil, niveau, modèle.
- Raccourcis : Ctrl+Enter, Ctrl+D, Ctrl+P, Ctrl+L, Ctrl+M, Ctrl+R, Ctrl+Shift+C, ?, Esc.
- Gestion responsive avec `useTerminalSize`.
- Intégration du moteur de reformulation et de la configuration.
- Validation complète : `tsc --noEmit`, `pnpm lint`, `pnpm test` (33 tests), `pnpm build` réussies.

## Reste à faire

- Commit `feat(lot-g): implement interactive TUI`.
- Passer au Lot H — Alias shell.

## Fichiers créés ou modifiés (Lot G)

- `src/app.tsx`
- `src/ui/hooks/use-terminal-size.ts`
- `src/ui/components/select-modal.tsx`
- `WORKLOG.md`

## Commandes exécutées (Lot G)

- `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → succès (33 tests passés).

## Décisions techniques

- TUI monolithique dans `app.tsx` pour la V1 ; composants extraits pour modales et hooks terminal.
- `ink-select-input` pour les sélections.
- Gestion des états via `useState`.

## Prochaine action

Effectuer le commit du Lot G puis commencer le Lot H.
