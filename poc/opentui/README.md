# POC OpenTUI Reqraft

Ce POC valide la direction visuelle et interactive OpenTUI avant toute migration
du produit principal.

## Lancement

```bash
pnpm poc:opentui
```

Prérequis actuel du POC : Bun doit être disponible localement. La commande
reste lancée via pnpm, mais OpenTUI 0.4.5 initialise son renderer natif avec
Bun dans cet essai ; le runtime Node a échoué sur le chargement FFI dans notre
environnement.

Le POC est isolé :

- aucune vraie clé API ;
- aucun appel provider ;
- aucune modification de la TUI Ink principale ;
- données mockées uniquement.

## Interactions

- `Ctrl+G` : lancer le faux streaming.
- `Ctrl+P` : picker profil.
- `Ctrl+L` : picker niveau.
- `Ctrl+I` : picker provider.
- `Ctrl+O` : picker modèle.
- `Ctrl+E` : bascule état erreur / retour au dernier résultat.
- `Ctrl+R` : reset.
- `Ctrl+Y` : copie mock.
- `?` : aide.
- `Tab` : focus éditeur / résultat.
- `↑` / `↓` : scroll ligne par ligne dans la zone active.
- `PageUp` / `PageDown` ou `Ctrl+U` / `Ctrl+D` : scroll par page dans la zone active.
- `Esc` ou `Ctrl+C` : fermeture propre.
- Souris : clic sur les badges profil, niveau, provider, modèle, puis clic sur
  une ligne du picker.

## Capture

Une capture texte représentative est disponible dans
[`docs/capture.md`](docs/capture.md). Le rendu réel utilise les couleurs,
bordures et états interactifs OpenTUI.

## Écarts assumés avec le HTML

- Pas d’ombres, de blur ou de cartes web : les terminaux ne les rendent pas de
  façon portable.
- Pas de grille web fixe : le layout se réduit selon la largeur du terminal.
- La copie est simulée : le POC prouve le feedback visuel, pas le presse-papiers.
- Le streaming est simulé avec des deltas textuels pour valider le renderer.
- Les zones longues sont bornées au viewport, scrollables au clavier, et
  affichent une scrollbar inspirée du composant Termcn `opentui/scroll-view`.
- La barre d’actions est rendue dans une zone réservée du layout pour rester
  visible après le streaming et les changements d’état.
- Le POC force un repaint complet des lignes de viewport pour éviter les traces
  visuelles après streaming, erreur ou resize.
- La registry `@termcn` est configurée via shadcn dans `components.json`.

## Critère de validation

Le POC est validé si l’écran principal te semble suffisamment premium et si les
interactions clavier/souris sont agréables avant d’investir dans la migration
réelle.
