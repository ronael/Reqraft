# Desktop — raccourcis, réglages, pistes d'amélioration

État des lieux après la release 0.5.0 et les correctifs desktop/i18n.
Référence normative : `docs/internal/DESKTOP.md`. Journal : `docs/internal/WORKLOG.md`.

---

## 1. Raccourcis — ce qui existe, ce qui manque

### En place

| Où | Touche | Action |
|---|---|---|
| Global | `⌥Espace` (replis `⌃⌥R`…) | capture la sélection → capsule |
| Global | `⌥⇧Espace` (repli `⌃⇧R`) | capsule en saisie libre, centrée |
| Capsule | `⏎` | remplacer (copie en mode plancher) |
| Capsule | `⌥` maintenu | comparaison avant/après |
| Capsule | `⌘C` | copier le résultat |
| Capsule | `⌘R` | relancer la génération |
| Capsule | `⇥` | niveau suivant (minimal → standard → complete) |
| Capsule | `⌘.` | interrompre |
| Capsule | `esc` | fermer |
| Saisie libre | `⌘⏎` | valider |
| Popover | `⌘⏎` | reformuler |
| Réglages | menus déroulants | changer les deux raccourcis globaux |

### Manquants (par ordre de valeur)

1. **`⇧⇥` pour reculer dans les niveaux** — le cycle `⇥` ne tourne que dans un
   sens ; quand on dépasse son niveau on refait le tour. Une ligne de code.
2. **Raccourci global pour le popover** — il ne s'ouvre qu'au clic sur l'icône
   tray. Un `⌥⇧R` (ou configurable) pour les utilisateurs 100 % clavier.
3. **`⌘D` : comparaison épinglée** — `⌥` exige de maintenir ; une bascule
   persistante aide pour les longs textes.
4. **Désactivation temporaire du raccourci global** (présentations, partage
   d'écran) via le menu tray — « Suspendre les raccourcis ».

### Non prévus volontairement

- Pas d'historique (`⌘↑` pour rappeler), pas de favoris : interdit par
  DESKTOP.md §1 (« aucun stockage des prompts »).
- Pas d'`explain` (`⌘E`) sur desktop : décision du registre de capacités,
  raison écrite dans `src/capabilities/registry.ts`.

---

## 2. Réglages — pistes d'amélioration

### Raccourcis (prioritaire)

- Bouton « Réinitialiser par défaut » pour revenir aux raccourcis automatiques.
- Bouton « Retester l'enregistrement » après avoir libéré un raccourci pris
  par une autre app.
- Lien direct vers le réglage système Accessibilité/Automatisation
  (`shell.openExternal("x-apple.systempreferences:…")`) au lieu de seulement
  déclencher le prompt.

### Providers

- Bouton **« Tester »** par provider (appelle `validateConfiguration()` — la
  primitive existe déjà dans `doctor.ts`) plutôt que le seul statut passif.
- Indiquer quel provider est le défaut (aujourd'hui seulement dans Modèles).

### Modèles

- **Liste déroulante des modèles réels** via `listModels()` du provider au
  lieu du champ texte libre (nécessite un canal `models:list`, la primitive
  existe dans `ProviderAdapter`).
- Exposer `timeoutMs`, `maxOutputTokens`, `fidelityMode`, `outputLanguage` —
  tous dans le schéma de config, aucun n'est éditable au desktop aujourd'hui.

### Profils

- Création/édition de profils custom est branchée dans les réglages ; il reste
  à tester le confort avec un catalogue réel de plusieurs dizaines de profils.

### Diagnostic

- Y inclure l'état des permissions (les deux, nommées) et des raccourcis —
  aujourd'hui seulement config + providers.
- Bouton « Copier le rapport » (pour les issues GitHub) — vérifier qu'aucune
  clé/valeur sensible ne s'y trouve par construction (le rapport est déjà
  sanitizé).

### Général

- **Onglet « Général »** : lancement au login (`app.setLoginItemSettings`),
  réinitialisation de la config. La langue d'interface est déjà dans
  Préférences et relance l'app automatiquement quand elle change.

---

## 3. Améliorations générales

### Robustesse (avant toute nouvelle feature)

1. **Tests E2E Playwright** — exigés par DESKTOP.md §8, pas encore écrits :
   démarrage, ouverture capsule, cycle complet avec provider `mock`, chemins
   d'échec (permission refusée, raccourci pris, provider en erreur, presse-
   papiers image, seconde instance). Le chemin heureux seul ne prouve rien.
2. **Message Wayland dans la capsule** — la détection existe (mode plancher)
   mais la capsule ne l'affiche pas encore à l'ouverture.

### Finitions produit (maquette pas encore couverte)

3. **Toast « ✓ Texte remplacé · ⌘Z pour annuler »** après remplacement
   (scénario 6 de la maquette).
4. **Sens du cycle ⇥ en cas d'expansion** : quand `disproportionate_expansion`
   est détecté, ⇥ devrait proposer le niveau INFÉRIEUR en premier (scénario 7),
   pas le suivant du cycle.
5. **Hauteur adaptative de la capsule** pour les longs résultats (le POC le
   faisait via ResizeObserver, borné 148–440 px) — aujourd'hui hauteur fixe
   380 px avec scroll.
6. **Mesure du cycle** : porter `timing.js` du POC (jalons, budget 400 ms)
   dans le main, exposé dans Diagnostic — c'est le critère §11.1 rendu visible.

### Outillage

7. **Mode démo** (`REQRAFT_DEMO=1` avec captures PNG) porté du POC — utile
   pour la landing page et les tests visuels.
8. **Canal de mise à jour** : la config packaging le prévoit (désactivé) ;
   brancher `electron-updater` quand un serveur de release existera.
9. **Icônes tray/template** : les points colorés actuels sont des placeholders
    générés — une vraie icône template (monochrome, s'adapte au thème clair de
    la menu bar) serait plus native.

### Portage (chantier ultérieur, déjà documenté)

10. Windows/Linux : module natif d'injection (nut.js), re-test Wayland,
    cibles electron-builder correspondantes.
