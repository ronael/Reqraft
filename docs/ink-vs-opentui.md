# Comparaison Ink vs OpenTUI pour Reqraft

Date : 2025-07-30
Versions mesurées :

- Ink / ink-text-input : 5.0.1 / 6.0.0
- @opentui/core / @opentui/react : 0.4.5 / 0.4.5

## Critères de comparaison

### Qualité visuelle

| Aspect | Ink | OpenTUI |
|--------|-----|---------|
| Bordures | Manuelles (Box + Text) | Composant `<box>` natif, styles variés |
| Couleurs Truecolor | Supportées via chalk | Supportées via `fg`/`bg` RGB |
| Ombrage / effets | Non | Effets de base possibles (attributs ANSI) |
| Rendu global | Très correct pour une CLI | Plus proche d’une GUI textuelle native |

**Verdict** : OpenTUI offre un rendu plus riche et plus stable, notamment sur les
bordures et le layout absolu.

### Souris

- **Ink** : pas de gestion native de la souris. Cliquer ne produit aucun effet
  dans une application Ink standard.
- **OpenTUI** : le core émet des `MouseEvent` (`down`, `up`, `move`, `scroll`).
  La couche React ne propulse pas encore d’API événementielle de clic (pas de
  `onClick`), mais on peut s’abonner à `renderer.on("mouse", …)` et mapper les
  coordonnées. Le spike le démontre pour les badges Profil/Niveau/Modèle.

**Verdict** : OpenTUI est supérieur, avec une légère friction car la couche
React est encore bas niveau.

### Clavier

- **Ink** : `useInput` global, pas de propagation/arrêt. Le Lot A a corrigé le
  problème en remplaçant `ink-text-input` par un composant maison qui ignore
  explicitement les touches Ctrl/Meta.
- **OpenTUI** : `useKeyboard` global, pas de dispatch automatique non plus, mais
  les composants natifs (`<input>`, `<textarea>`, `<select>`) gèrent leur propre
  focus et éditent nativement. `TextareaAction` expose des actions riches
  (déplacement mot, suppression ligne, etc.).

**Verdict** : OpenTUI est plus riche dès le départ ; Ink demande plus de
 mécanique maison.

### Focus

- **Ink** : le focus est géré à la main via `focus={true/false}` et
  `isActive`. Le risque de double-handler est réel (c’est le bug du Lot A).
- **OpenTUI** : chaque composant focusable porte une prop `focused`. Le renderer
  natif gère le curseur et les styles de focus.

**Verdict** : OpenTUI nettement plus robuste.

### Éditeur multiligne

- **Ink** : approche hybride `PromptField` + `TextInput` monoligne. Le Lot B
  détaille les limites (lignes committées non éditables, wrapping approximatif,
  Unicode fragile).
- **OpenTUI** : `<textarea>` natif avec buffer d’édition, curseur visuel,
  wrapping, scrolling, sélection, undo/redo.

**Verdict** : OpenTUI est incomparablement plus avancé.

### Scroll

- **Ink** : aucun composant de scroll natif. Reqraft tronque le résultat à
  `maxLines` lignes.
- **OpenTUI** : `<scrollbox>` natif avec barre de défilement, molette et
  clavier.

**Verdict** : OpenTUI sans conteste.

### Overlays

- **Ink** : modal géré à la main avec un arbre conditionnel.
- **OpenTUI** : `<box position="absolute">` et `zIndex`. Support natif plus
  flexible.

**Verdict** : OpenTUI plus simple et plus puissant.

### Streaming

- **Ink** : re-render React à chaque chunk ; fluide jusqu’à un certain débit.
- **OpenTUI** : renderer natif en Zig, plus performant théoriquement. Le spike
  montre un streaming simulé fluide.

**Verdict** : OpenTUI meilleur en théorie, à confirmer sous charge réelle.

### Resize

- **Ink** : `useTerminalSize` + ré-écriture manuelle de l’arbre.
- **OpenTUI** : layout Yoga + `useTerminalDimensions()` + resize handlers natifs.

**Verdict** : OpenTUI plus simple et plus robuste.

### Performances

- **Ink** : React reconciliation pur. Suffisant pour Reqraft actuel.
- **OpenTUI** : core natif Zig, probablement supérieur pour de grands volumes
  de texte et animations complexes.

### Temps de démarrage (mesurés approximativement via `expect` + SIGINT)

| Implémentation | Temps |
|----------------|-------|
| Ink (dist/cli.js) | ~0.54 s |
| OpenTUI (bun run src/main.tsx) | ~1.01 s |

Le démarrage d’OpenTUI inclut la compilation/loading du runtime natif ; il
peut varier selon la machine et Bun.

### Mémoire approximative

Mesure non automatisable dans cet environnement sans instrumentation. À
l’œil, OpenTUI charge un runtime plus lourd (core Zig + tree-sitter + yoga) ;
Ink est plus léger en mémoire résidente initiale.

### Fluidité du streaming

Subjectivement fluide des deux côtés pour un prompt Reqraft. OpenTUI devrait
mieux tenir pour de longs résultats (>écran) grâce au renderer natif et au
scrollbox.

### Nombre de fichiers / lignes

| Périmètre | Fichiers | Lignes |
|-----------|----------|--------|
| TUI Ink Reqraft (`src/ui/`, `src/app.tsx`) | 48 | ~2 830 |
| Spike OpenTUI (`spikes/opentui/src/`) | 3 | ~487 |

Le spike est volontairement minimal, mais il montre qu’OpenTUI réduit le
besoin de composants maison.

### Taille du bundle

- Ink Reqraft : `dist/cli.js` = **172.69 KB** (non minifié).
- OpenTUI : pas de bundle standalone comparable ; le runtime natif n’est pas
  comptabilisé dans le JS bundle. L’empreinte totale dépendra du packaging
  (binaires Zig + assets tree-sitter ~12 MB décompressés).

### Complexité

- **Ink** : bien connu, riche en abstractions React, mais demande beaucoup de
  code maison pour l’édition, le scroll, la souris et le focus.
- **OpenTUI** : surface d’API plus restreinte, concepts natifs (renderables,
  Yoga, buffer d’édition), courbe d’apprentissage plus raide au début.

### Compatibilité

| Plateforme | Ink | OpenTUI |
|------------|-----|---------|
| macOS | ✅ Node ≥20 | ✅ Testé avec Bun ; runtime natif Zig |
| Linux | ✅ Node ≥20 | ⚠️ probable mais non testé ; binaire natif à compiler/package |
| Windows | ✅ Node ≥20 | ⚠️ non testé ; packaging natif Windows à évaluer |

### Maintenance

- **Ink** : mature, communauté large, mise à jour fréquente, beaucoup
  d’extensions tierces.
- **OpenTUI** : en développement actif, API instable possible, documentation
  encore légère, moins d’exemples publics.

### Maturité

- **Ink** : stable en production (jest, npm, etc.).
- **OpenTUI** : jeune ; version 0.4.5, utilisé par OpenCode et terminal.shop en
  production, mais l’écosystème React est encore jeune.

## Résumé

OpenTUI domine sur presque tous les aspects fonctionnels, au prix d’un écosystème
moins mature et d’un runtime natif/packaging plus complexe. Ink reste une
solution fiable et légère pour des interfaces simples.
