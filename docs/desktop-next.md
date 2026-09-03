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
| Menu tray | case à cocher | suspendre/reprendre les raccourcis globaux |

### Manquants

- Aucun manque identifié sur le socle de raccourcis actuel.

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

- **Suspension temporaire** — la case « Suspendre les raccourcis globaux » du
  menu tray coupe les trois commandes sans oublier leurs enregistrements. Une
  infobulle et le Diagnostic rendent cet état visible. Changer une combinaison
  pendant la suspension reprend brièvement le registre Electron, remplace les
  raccourcis puis restaure la suspension, afin que la reprise ne laisse aucune
  commande inactive.

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

- **Livré :** « Réinitialiser » efface les choix explicites et revient aux
  combinaisons automatiques pour les trois commandes.
- **Livré :** « Retester » réécrit volontairement les mêmes choix afin de
  relancer l'enregistrement après avoir libéré une combinaison dans une autre
  application. L'état affiché est relu après l'opération.
- Lien direct vers le réglage système Accessibilité/Automatisation
  (`shell.openExternal("x-apple.systempreferences:…")`) au lieu de seulement
  déclencher le prompt.

### Providers

- **Livré :** bouton « Tester » par provider. Le processus principal hydrate
  les credentials, construit uniquement le provider demandé et appelle
  `validateConfiguration()` derrière un contrat IPC strict. Le renderer ne
  reçoit qu'un verdict localisé, jamais une clé, un header ou un message brut
  d'adaptateur. Pour un endpoint compatible OpenAI, une variable de clé
  déclarée mais absente est signalée. Ce test valide la configuration locale ;
  il ne prétend pas que le service distant a répondu.
- **Livré :** l'onglet marque « Par défaut » la ligne réellement utilisée, à
  côté du titre, en lecture seule — le choix reste dans Modèles. La règle vit
  dans `findDefaultProviderRow` (`ProviderRow.tsx`) : un identifiant intégré
  désigne sa propre ligne, tandis que `openai-compatible` désigne uniquement le
  **premier** endpoint déclaré, parce que le registre construit le provider à
  partir de `Object.values(config.providers)[0]`
  (`src/providers/registry.ts`). Les autres endpoints ne sont donc pas marqués,
  et rien ne l'est quand le catalogue est vide. C'est une limite honnête, pas
  un choix produit : le jour où l'endpoint utilisé sera nommé explicitement
  dans la configuration, l'indicateur suivra sans changer de forme.

### Modèles

- **Livré : catalogue réel des modèles.** `models:list` reçoit uniquement
  l'identité d'un provider intégré ou d'un endpoint déjà déclaré. Le main
  hydrate les credentials, valide la configuration, appelle `listModels()`
  avec un timeout puis renvoie une liste nettoyée, dédupliquée et bornée à 200
  entrées ; aucun message d'erreur d'adaptateur ne traverse l'IPC.
- L'onglet charge ce catalogue à chaque changement de provider et permet de
  l'actualiser. Une réponse obsolète est ignorée. Les catalogues absents, vides
  ou en erreur gardent le champ d'identifiant manuel, et un modèle courant qui
  n'apparaît pas dans la liste n'est jamais effacé automatiquement.
- Exposer `timeoutMs`, `maxOutputTokens`, `fidelityMode`, `outputLanguage` —
  tous dans le schéma de config, aucun n'est éditable au desktop aujourd'hui.

### Profils

- Création/édition de profils custom est branchée dans les réglages ; il reste
  à tester le confort avec un catalogue réel de plusieurs dizaines de profils.

### Diagnostic

- L'état des permissions et des trois raccourcis est inclus ; il reste à
  améliorer l'action corrective depuis chaque échec.
- ~~Bouton « Copier le rapport » (pour les issues GitHub)~~ — livré. Les
  garanties, dans l'ordre où elles tiennent :
  - le renderer ne formate ni ne transmet rien. `doctor:copy` a une charge
    utile strictement vide (`EmptyRequestSchema`), et il n'existe aucun canal
    presse-papiers générique : une chaîne venue du renderer ne peut pas
    atteindre le presse-papiers de l'utilisateur par ce chemin ;
  - le processus principal reconstruit le rapport avec la même fonction que
    `doctor:run` (`registerDoctorHandlers`), donc le texte partagé décrit
    exactement ce que l'onglet affiche ;
  - `formatDoctorReport` est pure et testée : entête, `version`, `platform`,
    puis une ligne `- [ok|fail] <id>[: <détail>]` par vérification, en LF avec
    un saut final. Elle n'est pas traduite — un rapport d'issue se compare
    d'une machine à l'autre ;
  - la sanitization reste acquise par construction (`DoctorCheck.detail` ne
    porte que des libellés du catalogue, des identifiants de configuration et
    des noms de variables manquantes, jamais une valeur d'environnement ni un
    message d'exception). Le formatage ajoute un dernier filet : le dossier
    personnel devient `~`, les caractères de contrôle sont aplatis et un
    détail anormalement long est tronqué.

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

   **Étendu depuis :** le scénario `capsule-ui` pilote le vrai renderer depuis
   le processus principal (`src/apps/desktop/main/e2e-capsule.ts`) et mesure des
   rectangles rendus à 560 px — hauteur de fenêtre, hauteur naturelle du
   contenu, pied dans la fenêtre, débordement du corps, position de l'annonce.
   Il vérifie aussi qu'un `⌘R` envoyé à la fenêtre pendant l'édition ne la
   recharge pas, et inventorie les accélérateurs du menu applicatif réel.
   `REQRAFT_DESKTOP_E2E_SHOTS=<dossier>` dépose une capture PNG par état, pour
   la relecture humaine ; la suite n'écrit rien par défaut.

   **Défaut trouvé et corrigé au passage :** Electron installe un menu par
   défaut quand l'application n'en pose aucun, et ce menu détient
   « Recharger ⌘R », « Recharger sans le cache ⇧⌘R » et le zoom. Un
   accélérateur de menu est traité par le système avant le renderer : aucun
   `preventDefault` de la capsule ne pouvait l'arrêter, et un `⌘R` — la commande
   « relancer » de la capsule — pouvait recharger la fenêtre et jeter le texte en
   cours d'édition. `src/apps/desktop/main/menu.ts` pose désormais un menu
   explicite : `appMenu`, `editMenu` (dont dépendent ⌘C, ⌘V, ⌘A dans les champs
   sur macOS), `windowMenu`, et les outils de développement en développement
   seulement.
2. **Message Wayland dans la capsule** — la détection existe (mode plancher)
   mais la capsule ne l'affiche pas encore à l'ouverture.

### Finitions produit (maquette pas encore couverte)

3. **Toast « ✓ Texte remplacé · ⌘Z pour annuler »** après remplacement
   (scénario 6 de la maquette). Le composant de toast partagé et les retours de
   copie/échec sont livrés ; l'annulation réelle du remplacement reste à
   concevoir avant d'afficher ce message.
   **Livré en complément :** le résultat peut être corrigé directement dans la
   capsule avant copie ou remplacement, et la comparaison utilise le texte
   corrigé. Le comportement est tenu par une suite d'intégration React qui monte
   la vraie capsule dans un DOM
   (`tests/unit/desktop-capsule-edit-flow.test.tsx`) : on tape dans les champs,
   on appuie sur les touches, et l'on vérifie ce que le pont IPC reçoit — prompt
   modifié envoyé à la relance et au changement de niveau, résultat modifié
   copié et remplacé, comparaison sur les deux textes repris, prompt vidé puis
   ressaisi, édition effacée par chaque nouvelle génération, et suspension des
   commandes pendant la saisie (⏎, ⌘C, ⌘R, ⌘D, ⇥) sans perdre `esc` ni `⌘.`.
4. **Sens du cycle ⇥ en cas d'expansion** : quand `disproportionate_expansion`
   est détecté, ⇥ devrait proposer le niveau INFÉRIEUR en premier (scénario 7),
   pas le suivant du cycle.
5. ~~**Hauteur adaptative de la capsule**~~ — livré, mais pas comme le POC.
   Celui-ci suivait le contenu avec un `ResizeObserver` : il voit chaque
   fragment de streaming et chaque frappe, donc la fenêtre oscillait ligne par
   ligne — exactement ce que DESKTOP.md §4.3 interdit, et la raison pour
   laquelle la hauteur avait fini figée à 380 px.

   La décision est désormais déterministe et prise aux transitions d'état, pas
   à chaque mutation du DOM. `src/apps/desktop/shared/capsule-geometry.ts`
   définit trois régimes :

   - `reserved` — 380 px pendant `capture`, `analysis`, `generating`,
     `streaming` et sous la feuille de profils. Aucune mesure, donc aucun saut
     pendant que le texte arrive ;
   - `adaptive` — `input`, `ready`, `comparison`, `error` prennent leur hauteur
     naturelle mesurée, quantifiée au pas de 4 px et bornée à 148–440 ;
   - `hold` — `applying`, `closed`, **et toute la durée d'une saisie**. Tant que
     le curseur est dans un champ, la géométrie est gelée et le corps défile ;
     la capsule se réajuste une seule fois, au relâchement du champ.

   Le renderer ne touche jamais à `BrowserWindow` : il mesure et propose une
   hauteur par le canal `capsule:resize` (schéma Zod strict), et le processus
   principal la reborne à la zone de travail. Le handler refuse tout envoyeur
   qui n'est pas la capsule — le preload est partagé par les quatre surfaces.

   La position est recalculée depuis l'**ancre mémorisée à l'ouverture**, jamais
   depuis la position courante : c'est ce qui empêche la fenêtre de dériver.
   Le côté (`below` / `above` / `centered`) est arrêté une fois par session avec
   la hauteur MAXIMALE, donc une capsule qui grandit ne bascule jamais de
   l'autre côté du curseur ; `below` fige le bord haut, `above` le bord bas.

   Mesures réelles, prises dans la vraie fenêtre à 560 px de large par le
   scénario e2e `capsule-ui` (pied visible et annonce dans la fenêtre dans tous
   les cas) :

   | état | hauteur | hauteur naturelle | corps |
   |---|---|---|---|
   | saisie libre | 204 | 203 | — |
   | résultat court | 172 | 169 | tient |
   | résultat moyen | 228 | 226 | tient |
   | résultat long | 440 (plafond) | 1175 | défile |
   | édition multiligne (court) | 172, inchangé | 442 | défile |
   | … après relâchement du champ | 440 | 442 | défile |
   | comparaison | 440 | 595 | défile |
   | erreur | 236 | 235 | tient |

   Compromis assumé : quatorze lignes collées dans une capsule de 172 px se
   lisent à travers un corps qui défile jusqu'à ce que le champ rende la main.
   Redimensionner pendant la frappe rendrait le cas rare confortable au prix de
   l'oscillation dans le cas courant.

   Écart volontaire : aucune animation de fenêtre. `setBounds(bounds, true)`
   anime le cadre sans le contenu, qui est déjà remis en page à la taille
   finale — cela se lit comme un rognage. Le redimensionnement est donc
   instantané, ce qui satisfait « réduire les animations » par construction ;
   les trois boucles d'attente de la capsule (barre, curseur, pulsation) sont en
   revanche coupées sous `prefers-reduced-motion`.
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
