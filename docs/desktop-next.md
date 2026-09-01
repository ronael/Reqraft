# Desktop — raccourcis, réglages, pistes d'amélioration

État des lieux après la release 0.5.0 et les correctifs desktop/i18n.
Référence normative : `docs/internal/DESKTOP.md`. Journal : `docs/internal/WORKLOG.md`.

---

## 1. Raccourcis — ce qui existe, ce qui manque

### En place

| Où | Touche | Action |
|---|---|---|
| Global | `⌘⌃R` (repli `⌘⌃J`) | capture la sélection → capsule |
| Global | `⌘⌃N` (repli `⌘⌃K`) | capsule en saisie libre, centrée |
| Global | `⌘⌃O` (repli `⌘⌃T`) | ouvrir ou fermer le popover |
| Capsule | `⏎` | remplacer (copie en mode plancher) |
| Capsule | `⌥` maintenu | comparaison avant/après, le temps de l'appui |
| Capsule | `⌘D` | comparaison avant/après épinglée (bascule) |
| Capsule | `⌘C` | copier le résultat |
| Capsule | `⌘R` | relancer la génération |
| Capsule | `⇥` | niveau suivant (minimal → standard → complete) |
| Capsule | `⇧⇥` | niveau précédent |
| Capsule | `⌘.` | interrompre |
| Capsule | `esc` | fermer |
| Saisie libre | `⌘⏎` | valider |
| Popover | `⌘⏎` | reformuler |
| Réglages | menus déroulants | changer les trois raccourcis globaux, à chaud |

### Manquants (par ordre de valeur)

1. **Désactivation temporaire des raccourcis globaux** (présentations, partage
   d'écran) via le menu tray — « Suspendre les raccourcis ».

### Livrés depuis

- **`⇧⇥` pour reculer dans les niveaux** — le cycle `⇥` tourne dans les deux
  sens ; l'infobulle de la commande `⇥` du pied annonce les deux.
- **`⌘D` : comparaison épinglée** — `⌥` exige de maintenir, ce qui ne tient pas
  sur un long texte. `⌘D` bascule la même comparaison, mains libres ; le pied
  montre la commande enclenchée. Les deux voies coexistent et sont tenues
  séparément : relâcher `⌥` ne défait pas un épinglage. L'épinglage tombe dès
  que l'« avant » affiché n'est plus celui du résultat montré — nouvelle
  capture, nouvelle génération (`⌘R`, `⇥`, changement de profil), fermeture ou
  remplacement appliqué.

- **Raccourci global du popover** — `⌘⌃O` ouvre et referme le même panneau que
  l'icône de la barre de menus, avec `⌘⌃T` en repli. Le choix est configurable
  dans Préférences et réenregistré immédiatement. Les collisions entre deux
  commandes Reqraft sont distinguées des raccourcis détenus par une autre app,
  pour ne pas envoyer l'utilisateur vers le mauvais correctif.

  Les règles vivent dans `src/apps/desktop/renderer/capsule/keyboard.ts`, un
  module pur au même titre que `capsule-machine.ts` : la suite tourne sous Node
  sans DOM, donc une règle laissée dans un `onKeyDown` n'était vérifiable qu'en
  relisant la source. La table §8.2 gagne au passage `comparison + accept →
  applying` : remplacer depuis une comparaison épinglée est le trajet normal,
  et sans cette sortie un remplacement refusé n'avait aucun état où retomber.

### Non prévus volontairement

- Pas d'historique (`⌘↑` pour rappeler), pas de favoris : interdit par
  DESKTOP.md §1 (« aucun stockage des prompts »).
- Pas d'`explain` (`⌘E`) sur desktop : décision du registre de capacités,
  raison écrite dans `src/capabilities/registry.ts`.

---

## 2. Réglages — pistes d'amélioration

### Raccourcis

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

- L'état des permissions et des trois raccourcis est inclus ; il reste à
  améliorer l'action corrective depuis chaque échec.
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

1. ~~**Tests E2E Electron**~~ — en place pour le démarrage, l'ouverture de la
   capsule, le cycle complet avec provider `mock`, le raccourci pris et la
   seconde instance. Les permissions OS et le presse-papiers image restent
   manuels pour ne pas modifier la machine qui exécute la suite.
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
8. **Canal de mise à jour** : la détection GitHub Release, la notification
   native, le tray et l'onglet Réglages sont branchés. Ajouter
   `electron-updater` après signature/notarisation et publication des métadonnées
   nécessaires ; jusque-là le téléchargement reste explicite.
9. **Icônes tray/template** : les points colorés actuels sont des placeholders
    générés — une vraie icône template (monochrome, s'adapte au thème clair de
    la menu bar) serait plus native.

### Portage (chantier ultérieur, déjà documenté)

10. Windows/Linux : module natif d'injection (nut.js), re-test Wayland,
    cibles electron-builder correspondantes.
