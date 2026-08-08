# Plan d'implémentation — Reqraft Desktop

Brief d'exécution pour une IA. Objectif : construire l'application de bureau en
une passe, sans rouvrir les décisions déjà tranchées et sans retomber dans les
pièges déjà identifiés.

Référence visuelle : `reqraft-native-ui.html` à la racine.
Référence de qualité de code : `docs/code-quality.md`.

---

# 1. Mission

Ajouter une **seconde interface** à Reqraft, de bureau, partageant intégralement
le cœur existant. Le CLI et la TUI restent inchangés et fonctionnels.

Le produit de bureau n'est pas une fenêtre. C'est **une capsule flottante
déclenchée au clavier**, plus deux surfaces secondaires. La fenêtre complète
existe pour la configuration et n'est pas l'interface principale.

Boucle cible, en quelques secondes :

```
sélection → raccourci → capsule → vérification → remplacer
```

## Ce qui n'est pas demandé

- Aucun historique de prompts. `PLAN.md` pose « sans stockage des prompts par
  défaut ». Ne pas l'ajouter, même « discrètement ».
- Aucune télémétrie, aucun crash reporter, aucun appel réseau autre que le
  provider choisi.
- Aucune réécriture du cœur, du CLI ou de la TUI.
- Aucun tableau de bord, aucune statistique agrégée.

---

# 2. Contraintes non négociables

1. **Le renderer ne parle jamais à un provider.** Il émet une intention via IPC ;
   le main process appelle `application/reprompt.ts`. Toute duplication du
   moteur est un échec du lot.
2. **Aucune clé API ne traverse l'IPC.** Elles restent dans le main process et
   le trousseau. Le renderer ne connaît que des états : configuré / absent.
3. **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.**
   Le `preload` expose une surface typée et minimale, jamais `ipcRenderer` brut.
4. **Le CLI continue de fonctionner à l'identique.** `pnpm quality` doit rester
   vert à chaque lot, tests existants compris.
5. **Le verdict de fidélité est affiché avant le texte.** C'est l'identité du
   produit, pas une option.
6. **L'application fonctionne sans permission Accessibilité**, en mode dégradé
   explicite. Elle ne doit jamais être bloquée par un refus.

---

# 3. Décisions déjà prises

Ne pas les rouvrir. Elles ont été instruites.

| Sujet | Décision |
|---|---|
| Framework | **Electron**. Le cœur est en TypeScript et lance des processus système (`security`, `secret-tool`) : il tourne tel quel dans le main. Tauri imposerait de le réécrire en Rust. |
| Ancrage de la capsule | **Position du curseur** via `screen.getCursorScreenPoint()`. Les bornes de sélection exigeraient l'API Accessibility en Objective-C, non portable. Le curseur est là où est l'attention. |
| Surface principale | Une seule capsule, deux ancrages : près du curseur s'il y a une sélection, centrée sinon. Un seul composant, une seule machine à états. |
| Raccourci par défaut | `⌥Espace` avec sélection, `⌥⇧Espace` sans. Configurables. |
| Fenêtre de réglages | Onglets horizontaux, pas de sidebar. Cinq écrans mensuels ne méritent pas une colonne permanente. |
| Palette | Violet `#a78bfa` / `#8b5cf6`, émeraude, ambre, rose. Identique à la TUI. |
| Historique | Hors périmètre. Voir section 1. |

---

# 4. Architecture imposée

```text
src/
  core/            inchangé
  application/     inchangé — point d'entrée unique du métier
  providers/       inchangé
  cli.tsx          inchangé
  app.tsx          inchangé (TUI)
  desktop/
    main/
      index.ts         bootstrap, instance unique, LSUIElement
      permissions.ts   état Accessibilité, demande, dégradation
      shortcuts.ts     enregistrement et conflits
      capture.ts       capture de la sélection
      inject.ts        réinjection du texte
      focus.ts         mémorisation et restauration de l'app source
      tray.ts          icône menu bar et son état
      windows/
        capsule.ts
        popover.ts
        settings.ts
      ipc.ts           canaux typés, un seul point de définition
    preload/
      index.ts         contextBridge, surface minimale
    renderer/
      capsule/         React
      popover/
      settings/
      shared/          tokens, composants communs
  ui/theme/
    palette-values.ts  NOUVEAU : valeurs hex brutes, source unique
```

`palette-values.ts` est extrait de `ui/theme/palette.ts` sans changer le
comportement de la TUI : cette dernière l'importe, le desktop aussi. Une seule
définition du violet Reqraft dans tout le dépôt.

**Règle de dépendance :** `desktop/renderer/` ne doit importer aucun module de
`src/core/`, `src/providers/` ou `src/auth/`. Ajouter une règle ESLint
`no-restricted-imports` qui échoue si c'est le cas.

---

# 5. Pièges connus, et leur réponse

Cette section est le cœur du plan. Chacun de ces points a déjà coûté du temps.
Ne pas les redécouvrir.

## 5.1 La capture de sélection détruit le presse-papiers

Il n'existe aucun moyen de lire la sélection d'une autre application. Le procédé
est : sauvegarder le presse-papiers, simuler `⌘C`, lire, **restaurer**.

Trois exigences :

- Restaurer systématiquement, y compris en cas d'erreur ou d'annulation. Un
  `try/finally`, pas un chemin heureux.
- Restaurer le **format** et pas seulement le texte : `clipboard.readImage()` et
  les autres formats survivent mal à un aller-retour naïf. Si le presse-papiers
  contenait autre chose que du texte, ne pas tenter la capture — ouvrir la
  capsule centrée à la place.
- La copie est asynchrone. Ne pas lire immédiatement : vider le presse-papiers,
  envoyer `⌘C`, puis **scruter jusqu'à 300 ms** que le contenu change. Si rien
  ne change, il n'y avait pas de sélection.

Ce dernier point est ce qui distingue « aucune sélection » de « sélection
identique au presse-papiers ». Sans le vidage préalable, les deux cas sont
indiscernables.

## 5.2 Le vol de focus casse la réinjection

La capsule a besoin du clavier, donc elle prend le focus. Mais `⌘V` doit
atterrir dans l'application d'origine, pas dans la capsule.

Procédure obligatoire :

1. Avant d'ouvrir la capsule, mémoriser l'application frontale.
2. Ouvrir la capsule et lui donner le focus.
3. À l'acceptation : écrire le résultat dans le presse-papiers, **réactiver
   l'application source**, attendre qu'elle soit frontale, puis simuler `⌘V`.
4. Restaurer le presse-papiers après un délai court.

L'étape 3 est celle qui échoue si on la bâcle. Réactiver et coller dans la même
milliseconde ne marche pas : il faut confirmer que l'application est redevenue
frontale avant d'injecter.

**C'est le point le plus risqué du projet.** Voir la section 6.

## 5.3 Electron n'envoie pas de touches aux autres applications

`webContents.sendInputEvent` n'agit que sur la fenêtre Electron. Simuler `⌘C` et
`⌘V` vers une autre application exige un module natif — `nut.js` ou équivalent —
à compiler pour les trois plateformes. Le prévoir dès le premier lot, pas après.

## 5.4 Wayland bloque l'injection

Sous Wayland, l'injection d'événements synthétiques est refusée par conception.
Ce n'est pas un bug à contourner. Détecter `XDG_SESSION_TYPE=wayland` et basculer
en mode plancher : la capsule fonctionne, `⏎` copie au lieu de remplacer, et
l'interface le dit.

## 5.5 Le raccourci global peut échouer silencieusement

`globalShortcut.register()` **retourne un booléen**. S'il est faux, le raccourci
est déjà pris par une autre application. Ne jamais l'ignorer : afficher un état
clair dans les réglages et proposer une alternative. Un raccourci qui ne se
déclenche pas sans explication est le pire échec possible pour ce produit.

## 5.6 Le streaming sur IPC fuit si on l'oublie

`onDelta` traverse déjà le cœur. Le brancher sur `webContents.send`. Deux
obligations : couper l'émission quand la capsule se ferme, et retirer le
listener côté renderer au démontage. Sinon chaque génération laisse un
abonnement derrière elle.

## 5.7 La télémétrie est active par défaut

Electron démarre le crash reporter. Appeler explicitement les désactivations et
ajouter un test qui échoue si la configuration réactive quoi que ce soit. La
promesse « aucune télémétrie » est dans le README ; elle doit être vérifiable.

## 5.8 Deux instances se battent pour le raccourci

`app.requestSingleInstanceLock()` dès le démarrage. Sans lui, un second
lancement vole le raccourci global et l'application devient imprévisible.

## 5.9 Les permissions se demandent, ne se supposent pas

Sur macOS, tester avec `systemPreferences.isTrustedAccessibilityClient(false)` —
`false` pour interroger sans déclencher la fenêtre système. Ne la déclencher
qu'au moment où l'utilisateur tente une action qui l'exige, avec une explication
préalable dans l'interface. Jamais au premier lancement.

## 5.10 Les entitlements se décident avant, pas après

La signature avec durcissement (`hardened runtime`) et les entitlements
d'automatisation doivent être posés dès la première configuration de packaging.
Les ajouter après oblige à tout resigner et à refaire la notarisation.

---

# 6. Spike obligatoire avant tout code d'interface

Ne pas commencer les lots avant d'avoir prouvé le chemin critique.

Écrire un programme jetable qui, sur la plateforme de développement :

1. enregistre un raccourci global et confirme le retour de `register()` ;
2. mémorise l'application frontale ;
3. vide le presse-papiers, simule `⌘C`, scrute le changement, lit le texte ;
4. restaure le presse-papiers ;
5. réactive l'application source et confirme qu'elle est frontale ;
6. écrit un texte connu dans le presse-papiers et simule `⌘V` ;
7. vérifie que le texte est arrivé au bon endroit.

**Mesurer le temps total du cycle.** S'il dépasse 400 ms, l'expérience promise
n'existe pas et il faut revoir l'approche avant d'investir dans l'interface.

Consigner le résultat dans `docs/desktop-spike.md` : ce qui marche, ce qui
échoue, les délais mesurés, les permissions demandées. Ce document conditionne
la suite.

---

# 7. Lots d'implémentation

Chaque lot se termine par une validation verte et un commit distinct.

## Lot 1 — Squelette et cœur partagé

- `desktop/main/index.ts`, instance unique, application accessoire sans icône
  du Dock sur macOS.
- IPC typé dans un fichier unique, `preload` minimal.
- Une fenêtre vide qui appelle `executeReprompt` via IPC et affiche le résultat
  brut.
- Extraction de `palette-values.ts`, consommée par la TUI et le desktop.
- Règle ESLint interdisant au renderer d'importer le cœur.

**Sortie :** un aller-retour complet renderer → main → provider → renderer, avec
le cœur inchangé et `pnpm quality` vert.

## Lot 2 — Permissions et capture

- `permissions.ts` : état, demande contextuelle, dégradation.
- `capture.ts` avec le protocole de la section 5.1, y compris la restauration.
- `focus.ts` avec la mémorisation et la restauration de l'application source.
- Détection Wayland et bascule en mode plancher.

**Sortie :** capture fiable d'une sélection dans trois applications différentes,
presse-papiers intact après coup, comportement correct sans permission.

## Lot 3 — La capsule

- Fenêtre sans cadre, transparente, au-dessus des autres, ancrée au curseur.
- Machine à états complète : analyse locale, génération, prêt, comparaison,
  accepté, refusé, erreur, expansion détectée.
- Streaming affiché via `onDelta`, avec la prévisualisation `previewRewritten`
  déjà écrite dans `core/stream-preview.ts` — **la réutiliser, ne pas la
  réécrire**.
- Verdict de fidélité en première ligne du pied.
- Raccourcis : `⏎` remplacer, `⌥` comparer, `⌘C` copier, `⌘R` relancer,
  `⇥` niveau, `esc` fermer, `⌘.` interrompre.

**Sortie :** le trajet complet de `reqraft-native-ui.html`, scénarios 1 à 8.

## Lot 4 — Menu bar et popover

- `Tray` avec les trois états : repos, travail en cours, erreur.
- Popover : saisie, collage, profil, niveau, dernier résultat.
- Ouverture des réglages depuis le popover.

**Sortie :** le produit est utilisable sans jamais ouvrir la fenêtre complète.

## Lot 5 — Fenêtre de réglages

- Onglets : Raccourcis, Providers, Modèles, Profils, Diagnostic.
- Réutilisation des use cases existants pour `doctor` et la configuration.
- Aucune clé affichée, jamais.

**Sortie :** parité fonctionnelle avec `rp config`, `rp doctor`, `rp auth status`.

## Lot 6 — Packaging et signature

- `electron-builder`, cibles macOS et Windows, Linux en `AppImage`.
- Durcissement, entitlements, notarisation macOS.
- Mise à jour automatique préparée mais désactivée par défaut.

**Sortie :** un binaire signé qui démarre sur une machine vierge.

---

# 8. Tests exigés

Le projet a 369 tests et une couverture de 63 %. Ne pas régresser.

**Modules purs, testables sans Electron** — placement de la capsule selon la
position du curseur et les bords d'écran, machine à états de la capsule,
résolution des raccourcis, décision de dégradation selon la plateforme et les
permissions. Ces modules doivent être extraits précisément pour être testables :
si une logique n'est testable qu'en lançant Electron, elle est au mauvais
endroit.

**Bout en bout** avec Playwright, qui pilote Electron : démarrage, ouverture de
la capsule, cycle complet avec le provider `mock`, fermeture propre.

**Chemins d'échec obligatoires** — permission refusée, raccourci déjà pris,
aucune clé API, provider en erreur, génération interrompue, presse-papiers
contenant une image, Wayland.

Le chemin heureux ne prouve rien sur ce produit : sa difficulté est entièrement
dans les cas dégradés.

---

# 9. Sécurité

- Le renderer ne reçoit jamais de clé, ni en clair ni masquée.
- Le `preload` expose des fonctions nommées, jamais `ipcRenderer`.
- Valider tout message IPC entrant côté main avec un schéma Zod — le renderer
  est traité comme non fiable, même s'il vient du même dépôt.
- Aucune ouverture d'URL externe sans confirmation explicite.
- `webSecurity` jamais désactivé.
- Le texte capturé ne doit jamais être écrit sur disque, ni dans un log, ni dans
  un rapport d'erreur.
- Faire passer le texte capturé par `detectSecrets()` avant tout envoi, comme le
  CLI le fait déjà.

---

# 10. Validation par lot

```bash
pnpm quality
pnpm test:desktop
```

Ne pas livrer un lot si l'une échoue. Interdits pour faire passer une
validation : `any` injustifié, `@ts-ignore`, `eslint-disable` sans justification
inscrite dans `docs/code-quality.md`, test supprimé ou neutralisé, `catch` vide.

Tenir `WORKLOG.md` à jour après chaque lot : ce qui a été fait, les décisions,
les écarts assumés, les mesures, la prochaine action.

---

# 11. Critères d'acceptation

1. Le trajet sélection → raccourci → capsule → remplacement fonctionne en moins
   d'une seconde hors temps provider.
2. Le presse-papiers de l'utilisateur est identique avant et après, dans tous
   les cas, y compris en cas d'erreur.
3. L'application fonctionne sans permission Accessibilité, en le disant.
4. Sous Wayland, la capsule fonctionne et l'absence de remplacement est
   expliquée.
5. Un raccourci déjà pris est signalé, jamais silencieux.
6. Le verdict de fidélité apparaît avant le texte reformulé.
7. Une expansion disproportionnée propose de baisser le niveau avant de
   proposer d'accepter.
8. Aucune clé API n'apparaît dans le renderer, les logs ou un rapport.
9. Le CLI et la TUI sont inchangés, `pnpm quality` vert.
10. Deux lancements simultanés ne se disputent pas le raccourci.
11. Aucune requête réseau autre que le provider configuré, vérifiée au moniteur.
12. Le binaire signé démarre sur une machine vierge sans avertissement.

---

# 12. Ce qu'il ne faut surtout pas faire

- Recréer une fenêtre à sidebar comme interface principale. Le produit est la
  capsule.
- Afficher le texte reformulé avant le verdict de fidélité.
- Ajouter un historique, une base locale, un cache de prompts.
- Dupliquer la logique de reformulation, de profils ou de fidélité dans le
  renderer.
- Supposer qu'une permission est accordée.
- Ignorer le retour de `globalShortcut.register()`.
- Laisser le presse-papiers modifié après une capture.
- Coller sans avoir confirmé que l'application source est redevenue frontale.
- Ajouter une dépendance d'interface lourde. Le renderer doit rester léger : la
  capsule s'ouvre des dizaines de fois par jour et doit apparaître instantanément.
- Réécrire `stream-preview.ts`, `select-list.ts`, `shortcuts.ts` ou
  `header-status.ts`. Ces modules sont purs, testés, et réutilisables tels quels.
