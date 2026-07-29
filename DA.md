

````md
# Mission — intégrer le design visuel Reqraft dans la TUI réelle

Le fichier HTML de référence est déjà présent dans le projet :

```text
reqraft-cli-ui.html
````

Utilise-le comme **source visuelle principale** pour refaire proprement l’interface terminal de Reqraft.

Le fichier HTML représente l’intention de design, la hiérarchie, les états et les composants attendus. Il ne doit pas être copié littéralement comme une interface web : il faut le traduire intelligemment vers les contraintes d’une TUI Ink/React.

L’objectif est d’obtenir une interface terminal :

* propre ;
* cohérente ;
* rapide ;
* lisible ;
* entièrement pilotable au clavier ;
* robuste sur différentes tailles de terminal ;
* fidèle aux fonctionnalités existantes ;
* visuellement proche du HTML de référence ;
* sans casser le comportement CLI non interactif.

Ne modifie pas la logique métier de reprompting, les providers, les profils, le benchmark ou les contrats de sortie, sauf lorsque cela est strictement nécessaire pour connecter proprement la TUI aux fonctions existantes.

---

# 1. Commencer par un audit réel

Avant toute modification, analyse :

```text
reqraft-cli-ui.html
src/app.tsx
src/ui/
src/commands/
src/config/
src/profiles/
src/providers/
src/models/
```

Identifie :

* les écrans déjà existants ;
* les états déjà gérés ;
* les raccourcis actuels ;
* les composants Ink actuels ;
* la logique métier encore mélangée à la présentation ;
* les fonctionnalités présentes dans le HTML mais absentes du produit ;
* les fonctionnalités présentes dans le produit mais absentes du HTML ;
* les écarts de terminologie ;
* les risques de régression.

Le HTML sert de référence visuelle, mais ne dois pas inventer de fonctionnalité métier absente du CLI.

Si un écran du HTML représente une fonctionnalité qui n’existe pas réellement, prépare seulement le composant visuel ou l’état si cela est utile, mais ne simule pas une fonctionnalité comme si elle fonctionnait.

Documente brièvement cet audit dans :

```text
docs/tui-implementation.md
```

---

# 2. Préserver les deux modes de Reqraft

Reqraft possède deux usages distincts.

## Mode non interactif

Exemples :

```bash
rp "améliore ce prompt"
echo "améliore ce prompt" | rp
rp --clipboard
rp --file demande.md
```

Ce mode doit rester sobre et compatible avec les pipes.

Règles absolues :

```text
stdout = résultat reformulé uniquement
stderr = stats, warnings, diagnostics et erreurs
```

La refonte visuelle ne doit jamais injecter :

* bordures ;
* logo ;
* couleurs décoratives ;
* raccourcis ;
* spinner persistant ;
* messages d’accueil ;

dans `stdout`.

Cette commande doit continuer à fonctionner :

```bash
rp "ma demande" --stats | pbcopy
```

Le presse-papiers ne doit recevoir que le prompt reformulé.

## Mode interactif

La commande :

```bash
rp
```

ouvre la TUI complète.

Le design HTML doit être appliqué principalement à ce mode.

Ne partage pas aveuglément les composants d’affichage du mode interactif avec le renderer du mode non interactif.

---

# 3. Traduction du HTML vers Ink

Ne reproduis pas les classes Tailwind une par une.

Traduis les concepts visuels :

```text
flex
grid
gap
padding
border
background
text color
muted text
badge
focus
selected state
modal
toast
empty state
```

vers les primitives Ink adaptées :

```tsx
<Box />
<Text />
<Static />
<Newline />
```

et les composants déjà utilisés dans le projet.

Le HTML est une maquette visuelle, pas une architecture technique.

Évite :

* les composants géants ;
* les conditions imbriquées dans un seul fichier ;
* les couleurs codées en dur dans tous les composants ;
* les tailles fixes non adaptatives ;
* la duplication d’un même panneau pour chaque écran.

---

# 4. Créer un vrai design system terminal

Construis une couche UI légère et réutilisable.

Structure recommandée :

```text
src/ui/
  theme/
    palette.ts
    tokens.ts
    semantic.ts
    types.ts
  components/
    AppFrame.tsx
    Header.tsx
    Footer.tsx
    Panel.tsx
    PanelHeader.tsx
    Badge.tsx
    StatusBadge.tsx
    KeyHint.tsx
    ShortcutBar.tsx
    Divider.tsx
    Notice.tsx
    EmptyState.tsx
    LoadingState.tsx
    ErrorState.tsx
    Confirmation.tsx
    SelectList.tsx
    FormField.tsx
    TextArea.tsx
    Toast.tsx
  screens/
    MainScreen.tsx
    HelpScreen.tsx
    DiffScreen.tsx
    ExplainScreen.tsx
    ProfilePickerScreen.tsx
    LevelPickerScreen.tsx
    ProviderPickerScreen.tsx
    ModelPickerScreen.tsx
    InitScreen.tsx
    DoctorScreen.tsx
    ConfigScreen.tsx
    ProfilesScreen.tsx
    ProvidersScreen.tsx
    ModelsScreen.tsx
    AliasScreen.tsx
  hooks/
    useTerminalSize.ts
    useFocusManager.ts
    useKeyboardShortcuts.ts
    useToast.ts
  utils/
    truncate.ts
    layout.ts
```

Adapte cette structure à l’architecture existante si un découpage équivalent existe déjà.

Ne crée pas une deuxième architecture parallèle inutilement.

---

# 5. Tokens visuels

Centralise tous les choix visuels.

Prévois au minimum :

```ts
type ThemeTokens = {
  colors: {
    text: string;
    textMuted: string;
    textSubtle: string;
    accent: string;
    accentStrong: string;
    border: string;
    borderFocused: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
  };
};
```

Ne définis pas de “background color” comme si Ink fonctionnait exactement comme le web.

Utilise les capacités réelles du terminal.

Prévois un fallback lisible lorsque :

* les couleurs sont désactivées ;
* le terminal supporte peu de couleurs ;
* `NO_COLOR` est défini ;
* le rendu Unicode n’est pas fiable.

La couleur ne doit jamais être le seul moyen de comprendre un état.

Exemple :

```text
✓ succès
! avertissement
× erreur
● actif
○ inactif
```

---

# 6. Écran principal

L’écran principal doit suivre la hiérarchie du HTML de référence.

## Header

Afficher :

* `reqraft` ;
* éventuellement une baseline courte ;
* provider actif ;
* modèle actif ;
* état de configuration si nécessaire.

Éviter un header trop haut.

Sur petite largeur, réduire automatiquement les métadonnées.

## Zone de saisie

La zone de saisie doit :

* avoir un focus évident ;
* accepter les retours à la ligne ;
* gérer correctement le collage de longs prompts ;
* ne pas perdre le curseur ;
* ne pas déclencher les raccourcis globaux pendant une saisie normale ;
* afficher un placeholder seulement lorsque le champ est vide ;
* conserver l’entrée en cas d’erreur provider.

Placeholder recommandé :

```text
Écris ta demande brute, même imparfaite…
```

Ne remplace pas la saisie utilisateur lors d’un changement de profil, niveau ou modèle.

## Barre de contexte

Afficher clairement :

* profil ;
* niveau ;
* provider ;
* modèle.

Ces éléments doivent être interactifs via les raccourcis existants.

Ne transforme pas ces badges en éléments uniquement décoratifs.

## Zone de résultat

Prévoir les états :

```text
idle
ready
loading
streaming
success
error
empty-response
fidelity-warning
```

Le résultat ne doit pas disparaître lorsqu’un toast apparaît.

Pendant le streaming :

* afficher le texte progressivement ;
* éviter de rerendre toute la TUI de manière coûteuse ;
* conserver une hauteur stable autant que possible ;
* permettre l’annulation si le projet la supporte déjà.

## Barre de raccourcis

Afficher seulement les raccourcis réellement disponibles dans l’état courant.

Exemples :

```text
Ctrl+Enter Générer
Ctrl+P Profil
Ctrl+L Niveau
Ctrl+M Modèle
Ctrl+D Diff
Ctrl+R Régénérer
? Aide
Esc Retour
```

Les actions indisponibles doivent être :

* masquées ;
* ou affichées de manière désactivée.

Ne montre pas `Diff` lorsqu’aucun résultat n’existe.

---

# 7. Gestion correcte du clavier

La TUI doit être clavier-first.

Définis clairement la priorité des événements :

```text
champ en saisie
→ raccourcis locaux du champ
→ raccourcis de l’écran
→ raccourcis globaux
```

Évite qu’une lettre tapée dans un champ déclenche une commande globale.

Vérifie particulièrement :

* `Ctrl+Enter` ;
* `Enter` ;
* `Tab` ;
* `Shift+Tab` ;
* `Esc` ;
* `Ctrl+C` ;
* `Ctrl+P` ;
* `Ctrl+M` ;
* `Ctrl+L` ;
* `Ctrl+D` ;
* `Ctrl+R` ;
* `?`.

`Ctrl+C` doit :

* annuler proprement une génération si possible ;
* sinon fermer proprement l’application ;
* restaurer le curseur ;
* ne pas laisser le terminal dans un état cassé.

`Esc` doit fermer le niveau d’interface courant, pas quitter brutalement depuis une modal ou un sélecteur.

---

# 8. Focus management

Crée un système de focus centralisé.

Chaque écran ou overlay doit déclarer ses zones focusables.

Exemple :

```ts
type FocusTarget =
  | "prompt-input"
  | "profile-picker"
  | "level-picker"
  | "provider-picker"
  | "model-picker"
  | "result"
  | "confirmation";
```

Lors de la fermeture d’une modal, restaurer le focus précédent.

Évite :

* le focus invisible ;
* le focus perdu après une erreur ;
* deux éléments visuellement actifs en même temps ;
* un retour automatique au premier champ après chaque rerender.

---

# 9. Écrans de sélection

Les écrans de sélection doivent être génériques.

Utilise un composant partagé pour :

* profils ;
* niveaux ;
* providers ;
* modèles ;
* actions de la palette.

Fonctionnalités :

* navigation avec flèches ;
* validation avec Enter ;
* annulation avec Esc ;
* recherche locale si la liste est longue ;
* élément actuel marqué ;
* description courte ;
* scroll lorsque la liste dépasse la hauteur disponible.

Ne suppose pas que tous les modèles tiennent dans un seul écran.

Ne tronque pas l’identifiant technique important sans moyen de le consulter.

---

# 10. Écran `rp init`

Le parcours d’initialisation doit utiliser le même design system, mais rester distinct de l’écran principal.

Étapes visuelles :

```text
intro
configuration existante
provider
clé API détectée ou absente
modèle
profil
niveau
préférences
récapitulatif
confirmation
test facultatif
succès
erreur
```

Règles :

* ne jamais afficher une clé API ;
* ne jamais écrire une clé dans les logs ou snapshots ;
* ne jamais masquer silencieusement une configuration existante ;
* conserver les valeurs actuelles lors d’une modification ;
* ne sauvegarder qu’après confirmation ;
* montrer clairement l’étape courante ;
* permettre de revenir à l’étape précédente ;
* ne pas perdre les réponses déjà saisies.

Le HTML peut montrer plusieurs cartes ou panneaux, mais dans le terminal il faut privilégier un wizard compact.

---

# 11. Écrans secondaires

Applique le même système visuel à :

```text
rp doctor
rp config
rp profiles
rp providers
rp models
rp alias
rp init
```

Mais respecte la nature de chaque commande.

## `doctor`

Afficher une liste d’états :

```text
✓ configuré
! incomplet
× erreur
```

Ne pas afficher de secret.

## `config`

Afficher :

* clé ;
* valeur ;
* source éventuelle ;
* valeur sensible masquée.

## `profiles`

Afficher :

* identifiant ;
* nom ;
* description ;
* profil intégré ou personnalisé ;
* profil actif.

## `providers`

Afficher :

* identifiant ;
* état configuré ;
* variable attendue ;
* modèle par défaut ;
* disponibilité si elle est connue localement.

## `models`

Afficher :

* identifiant ;
* provider ;
* preset ;
* recommandé ou non ;
* capacités disponibles si elles existent déjà.

Ne fais pas d’appels réseau automatiques uniquement pour embellir ces écrans.

---

# 12. États de chargement

Le spinner doit être léger.

Il ne doit pas :

* provoquer de gros rerenders ;
* casser les captures terminales ;
* polluer les pipes ;
* continuer après la fin de l’opération ;
* masquer le résultat.

Prévoir des libellés précis :

```text
Reformulation en cours…
Vérification de la configuration…
Test de connexion…
Chargement des profils…
```

Évite les messages vagues comme :

```text
Loading…
Please wait…
```

---

# 13. Erreurs

Crée une présentation commune des erreurs.

Chaque erreur visible doit contenir :

```text
titre
message principal
cause utile si connue
prochaine action
code éventuel en mode verbose
```

Exemple :

```text
× Clé API absente

La variable OPENAI_API_KEY n'est pas disponible dans l'environnement.

Ajoute-la à ton shell puis relance :
rp doctor
```

Ne montre pas :

* stack trace par défaut ;
* payload complet ;
* headers ;
* prompt complet ;
* clé ;
* données internes inutiles.

Le mode `--verbose` peut afficher les détails techniques sur `stderr`, pas dans la TUI principale sauf écran dédié.

---

# 14. Confirmations

Les confirmations doivent être explicites.

Exemples :

```text
Écraser la configuration existante ?
Envoyer malgré le secret détecté ?
Supprimer cet alias ?
Tester la connexion au provider ?
```

Options cohérentes :

```text
Confirmer
Annuler
Retour
```

Ne préselectionne jamais une action destructive.

Les confirmations doivent être utilisables au clavier et restaurer le focus précédent après fermeture.

---

# 15. Toasts et notifications

Utilise les toasts uniquement pour les actions courtes :

```text
Copié dans le presse-papiers
Profil changé : frontend
Modèle changé : gpt-4.1-mini
Configuration enregistrée
```

Les erreurs importantes ne doivent pas apparaître uniquement sous forme de toast temporaire.

Un toast ne doit pas modifier la hauteur globale de manière brutale si cela peut être évité.

---

# 16. Responsive terminal

Teste au minimum :

```text
120 colonnes
100 colonnes
80 colonnes
60 colonnes
40 colonnes
```

Comportement attendu :

## Large

* header complet ;
* métadonnées alignées ;
* barres de contexte détaillées ;
* raccourcis visibles.

## Moyen

* réduction des espacements ;
* regroupement des métadonnées ;
* raccourcis condensés.

## Petit

* header simplifié ;
* métadonnées sur plusieurs lignes ;
* raccourcis essentiels seulement ;
* panneaux sans bordures inutiles ;
* texte tronqué proprement ;
* aucune exception de rendu.

Ne fais pas reposer toute l’interface sur une largeur fixe.

Utilise la largeur réelle de `stdout.columns`.

Gère également les changements de taille pendant l’exécution.

---

# 17. Hauteur terminal

Gère les terminaux de faible hauteur.

Priorités d’affichage :

```text
1. saisie active
2. erreur ou résultat
3. contexte
4. raccourcis
5. éléments décoratifs
```

Lorsque la hauteur est faible :

* réduire les marges ;
* masquer la baseline ;
* condenser le header ;
* réduire la hauteur de la sortie ;
* permettre le scroll ;
* ne jamais masquer totalement le champ actif.

---

# 18. Longs contenus

Tester :

* prompt de 1 ligne ;
* prompt de 50 lignes ;
* résultat long ;
* longs identifiants de modèles ;
* longues erreurs ;
* chemins Windows ;
* texte avec accents ;
* emoji ;
* code Markdown ;
* commandes shell.

Prévoir :

* wrapping contrôlé ;
* troncature seulement pour les métadonnées ;
* scroll pour les grandes listes ;
* conservation complète du prompt et du résultat ;
* aucun écrasement de contenu.

Ne tronque jamais silencieusement le résultat final.

---

# 19. Unicode et compatibilité

Les caractères de bordure doivent avoir un fallback ASCII.

Exemple :

```text
Unicode : ┌ ─ ┐ │ └ ┘
ASCII   : + - + | + +
```

Ne suppose pas que toutes les polices terminales affichent correctement :

* symboles exotiques ;
* emoji ;
* ligatures ;
* caractères de largeur ambiguë.

Utilise des symboles simples.

---

# 20. Curseur terminal

Gère correctement la visibilité du curseur.

Le curseur doit :

* être visible dans les champs de saisie ;
* être masqué dans les écrans purement consultatifs si pertinent ;
* toujours être restauré à la fermeture ;
* être restauré après une exception ;
* être restauré après `Ctrl+C`.

Ajoute un test manuel spécifique pour cela.

---

# 21. Accessibilité

La lisibilité doit rester correcte :

* sans couleur ;
* avec contraste faible ;
* avec thème terminal clair ;
* avec thème terminal sombre ;
* dans un terminal monochrome.

Ne mets pas du texte noir forcé sur fond inconnu.

Évite de supposer un fond sombre.

Prévois une palette qui repose principalement sur la couleur du texte, sans imposer de grands arrière-plans.

---

# 22. Performance Ink

Évite les rerenders inutiles.

Utilise avec discernement :

```tsx
React.memo
useMemo
useCallback
```

mais seulement lorsque pertinent.

Sépare :

* état de saisie ;
* état provider ;
* état de navigation ;
* notifications ;
* résultat.

Le spinner ne doit pas rerendre toute l’application.

Le streaming ne doit pas recalculer toute la liste des profils ou modèles à chaque token.

Mesure le ressenti de frappe pendant une génération.

---

# 23. Préserver la logique existante

Réutilise les fonctions et services existants :

* génération ;
* configuration ;
* providers ;
* modèles ;
* profils ;
* copie ;
* stats ;
* diff ;
* explain ;
* secret detection.

Ne duplique pas ces comportements dans les composants UI.

Les composants doivent recevoir des données et déclencher des actions.

Architecture attendue :

```text
UI
→ controller / hooks
→ services existants
→ moteur Reqraft
```

Pas :

```text
UI
→ implémentation parallèle du moteur
```

---

# 24. Terminologie

Conserve strictement les termes Reqraft existants :

```text
Profile
Level
Provider
Model
Diff
Explain
Stats
Doctor
Config
Alias
```

ou leurs traductions déjà présentes dans l’application.

Ne mélange pas français et anglais sans stratégie cohérente.

Si l’interface actuelle est en français, garde les commandes et identifiants techniques en anglais, mais les libellés utilisateur en français.

Exemple :

```text
Profil : frontend
Niveau : standard
Provider : openai
Modèle : gpt-4.1-mini
```

Ne renomme pas les commandes existantes.

---

# 25. Design fidèle, sans copier les défauts du HTML

Le HTML de référence peut contenir des choix adaptés au navigateur mais mauvais pour un terminal.

Corrige notamment :

* les trop grands espacements ;
* les panneaux trop nombreux ;
* les bordures imbriquées ;
* les cartes trop hautes ;
* les badges trop nombreux ;
* les lignes trop longues ;
* les titres trop décoratifs ;
* les écrans qui supposent une grande largeur.

Préserve l’intention visuelle, pas les défauts de transposition.

---

# 26. Tests automatisés

Ajoute ou adapte des tests sur :

## Composants

* Header ;
* Panel ;
* Badge ;
* ShortcutBar ;
* EmptyState ;
* ErrorState ;
* Confirmation ;
* SelectList.

## États

* accueil vide ;
* saisie ;
* chargement ;
* streaming ;
* succès ;
* erreur ;
* sortie vide ;
* warning de fidélité ;
* secret détecté ;
* confirmation.

## Navigation

* ouverture d’un picker ;
* déplacement ;
* validation ;
* annulation ;
* restauration du focus ;
* retour à l’écran principal.

## Responsive

Tester des largeurs simulées :

```text
40
60
80
120
```

## Non interactif

Vérifier que :

```text
stdout = prompt uniquement
stderr = stats et erreurs
```

La refonte ne doit pas casser les tests CLI existants.

Évite les snapshots gigantesques et fragiles.

Préférer des assertions sur :

* textes importants ;
* états ;
* raccourcis ;
* présence ou absence d’éléments ;
* comportement clavier.

---

# 27. Tests manuels obligatoires

Tester au minimum :

```bash
pnpm dev
pnpm dev "corrige cette phrase"
pnpm dev "corrige cette phrase" --stats
echo "corrige cette phrase" | pnpm dev
pnpm dev --clipboard
pnpm dev init
pnpm dev doctor
pnpm dev config
pnpm dev profiles
pnpm dev providers
pnpm dev models
```

Dans la TUI, tester :

* saisie simple ;
* saisie multilignes ;
* collage long ;
* génération ;
* streaming ;
* erreur provider ;
* clé absente ;
* résultat vide ;
* changement de profil ;
* changement de niveau ;
* changement de modèle ;
* diff ;
* explain ;
* copie ;
* aide ;
* resize terminal ;
* Ctrl+C ;
* Esc ;
* petit terminal.

---

# 28. Lots d’implémentation

## Lot A — Audit et fondations

* auditer le HTML et la TUI existante ;
* documenter les écarts ;
* définir les tokens ;
* créer la couche thème ;
* préparer le responsive terminal.

## Lot B — Composants de base

* AppFrame ;
* Header ;
* Panel ;
* Badge ;
* KeyHint ;
* ShortcutBar ;
* Notice ;
* EmptyState ;
* LoadingState ;
* ErrorState ;
* SelectList ;
* Confirmation ;
* Toast.

## Lot C — Écran principal

* header ;
* saisie ;
* contexte ;
* résultat ;
* états ;
* shortcuts ;
* streaming ;
* focus.

## Lot D — Pickers et overlays

* profil ;
* niveau ;
* provider ;
* modèle ;
* aide ;
* diff ;
* explain ;
* confirmation.

## Lot E — Init

* wizard complet ;
* navigation ;
* récapitulatif ;
* erreurs ;
* test provider ;
* succès.

## Lot F — Écrans secondaires

* doctor ;
* config ;
* profiles ;
* providers ;
* models ;
* aliases.

## Lot G — Responsive et robustesse

* petites largeurs ;
* faibles hauteurs ;
* longs contenus ;
* Unicode fallback ;
* NO_COLOR ;
* curseur ;
* resize.

## Lot H — Tests et polish

* tests unitaires ;
* tests TUI ;
* tests E2E ;
* nettoyage ;
* documentation ;
* captures terminal éventuelles.

---

# 29. WORKLOG

Maintiens à la racine :

```text
WORKLOG.md
```

Après chaque étape importante, indique :

* lot en cours ;
* fichiers modifiés ;
* composants créés ;
* décisions de design ;
* différences assumées avec le HTML ;
* tests exécutés ;
* erreurs restantes ;
* prochaine action.

Une autre IA doit pouvoir reprendre le travail sans relire tout le dépôt.

---

# 30. Validation à chaque lot

À la fin de chaque lot :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Ne commit pas un lot si une commande échoue.

Ne masque pas les erreurs avec :

* `any` injustifié ;
* `@ts-ignore` ;
* tests supprimés ;
* snapshots mis à jour sans contrôle ;
* règles ESLint désactivées globalement ;
* catch vide.

---

# 31. Commits

Créer un commit distinct par lot.

Exemples :

```text
feat(ui): add reqraft terminal design system
feat(tui): redesign main interactive screen
feat(tui): add pickers and keyboard navigation
feat(init): apply unified terminal wizard design
feat(ui): harmonize secondary screens
fix(tui): improve responsive terminal behavior
test(tui): add interaction and layout coverage
```

Ne publie pas de nouvelle version npm sans autorisation explicite.

---

# 32. Critères d’acceptation

Le chantier est terminé lorsque :

1. Le rendu TUI est clairement fidèle à l’identité du HTML.
2. Le mode interactif paraît cohérent et abouti.
3. Le mode non interactif reste inchangé fonctionnellement.
4. Les pipes ne sont pas cassés.
5. Le clavier permet d’utiliser toutes les fonctions principales.
6. Le focus est toujours visible et cohérent.
7. Les erreurs et confirmations sont claires.
8. Tous les écrans partagent le même design system.
9. La TUI fonctionne de 40 à 120 colonnes.
10. Les contenus longs ne cassent pas le layout.
11. `Ctrl+C` restaure correctement le terminal.
12. Les clés API ne sont jamais affichées.
13. Le spinner et le streaming restent fluides.
14. Aucun comportement métier n’est dupliqué dans l’UI.
15. Toutes les validations réussissent.
16. `WORKLOG.md` est à jour.
17. Les commits sont séparés par lot.

---

# 33. Résultat attendu

À la fin, fournis :

* résumé des écrans intégrés ;
* composants UI créés ;
* écarts assumés par rapport au HTML ;
* architecture finale ;
* raccourcis disponibles ;
* tailles terminal testées ;
* résultats exacts de :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

* tests manuels exécutés ;
* commits créés ;
* limites restantes ;
* captures terminal textuelles ou screenshots si le projet en produit déjà.

Ne t’arrête pas après l’audit ou après la création du design system.

Réalise l’intégration complète en suivant les lots, sauf blocage réel nécessitant une décision humaine.

```

Le point le plus important de ce prompt est la séparation stricte entre la **TUI Ink** et la **sortie CLI non interactive**. C’est le défaut le plus facile à introduire pendant une refonte visuelle, et celui qui casserait immédiatement les pipes, les scripts et le presse-papiers.
```
