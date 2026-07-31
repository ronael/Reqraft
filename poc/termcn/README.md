# POC Termcn / Ink

Ce POC est une refonte propre de la preuve de concept UI de Reqraft. Il remplace
l’essai OpenTUI (qui nécessitait Bun) par une stack **Ink + React + composants
Termcn**, exécutable sous Node.

## Lancement

```bash
pnpm poc:termcn
```

Ou directement depuis ce répertoire :

```bash
pnpm dev
```

## Validation

```bash
pnpm poc:termcn:typecheck
```

## Stack

- [Ink](https://github.com/vadimdemedes/ink) 5.x
- React 18.x
- Composants [Termcn](https://termcn.dev) installés via le registry shadcn :
  `theme-provider`, `app-shell`, `text-area`, `select`, `model-selector`,
  `spinner`, `badge`, `card`, `alert`.

## Fonctionnalités reproduites

- Édition multi-ligne du prompt avec `TextArea`.
- Badges de contexte (profil, niveau, provider, modèle).
- Picker de profil, niveau et provider via `Select`.
- Picker de modèle via `ModelSelector` groupé par provider.
- Streaming mock, état erreur, copie mock.
- Raccourcis clavier : `Ctrl+G`, `Ctrl+P`, `Ctrl+L`, `Ctrl+I`, `Ctrl+O`,
  `Ctrl+E`, `Ctrl+R`, `Ctrl+Y`, `Tab`, `?`, `Esc`.

## Écarts assumés

- Le POC reste entièrement mocké : aucun appel provider, aucune vraie clé API.
- La copie est simulée (feedback visuel uniquement).
- Le presse-papiers réel et la gestion des credentials sont du ressort du
  projet principal.

## Ancien POC OpenTUI

Le répertoire `poc/opentui/` conserve l’essai initial à titre d’archive et de
comparaison. Les scripts racine pointent désormais sur ce POC Termcn.
