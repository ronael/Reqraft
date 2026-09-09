# Checklist de test manuel — desktop Windows

À exécuter sur l'installateur **Windows x64 `-experimental.exe`** de la release,
dans une VM ou une session Windows dédiée. Le lancement du bundle de développement
ne valide ni l'installation, ni la désinstallation, ni SmartScreen.

Windows reste **Alpha** : la capture, le remplacement et le stockage sécurisé
Windows ne sont pas encore implémentés. Les contrôles correspondants ci-dessous
sont des critères à atteindre avant la Beta, pas des fonctionnalités déclarées
disponibles. Voir [le statut des plateformes](desktop-platform-support.md) et
[la roadmap](roadmap.md).

## Compte rendu reproductible

Copier ces informations dans le rapport de test, sans clé API ni texte personnel :

| Information                                                | Valeur à renseigner |
| ---------------------------------------------------------- | ------------------- |
| Date, personne                                             |                     |
| Version Reqraft, tag/commit, lien de l'artefact            |                     |
| Windows : édition, version et build (`winver`)             |                     |
| Architecture, disposition clavier, langue système          |                     |
| Nombre d'écrans, résolution, mise à l'échelle              |                     |
| Installation vierge ou mise à niveau depuis quelle version |                     |
| Signature et avertissement SmartScreen observés            |                     |
| Applications sources et versions                           |                     |

Pour chaque contrôle, noter **réussi**, **échoué** ou **non testé**, avec le
parcours exact, le résultat attendu et le résultat observé. Un blocage connu
reste un échec ; une capture d'écran accompagne les écarts visuels. Ne jamais
cocher une ligne simplement parce que le build ou un test injecté passe.

## 1. Installation et premier lancement

- [ ] Utiliser un compte de test sans configuration Reqraft, sans clé API dans
      l'environnement et sans `ELECTRON_RUN_AS_NODE`. Ne pas effacer la
      configuration d'un compte utilisé au quotidien pour simuler cet état.
- [ ] Installer depuis l'EXE téléchargé. Relever le chemin d'installation et
      tout avertissement de signature/SmartScreen. Ne pas désactiver la
      protection système pour obtenir un résultat « réussi ».
- [ ] Ouvrir Reqraft depuis le raccourci installé : une icône tray apparaît,
      le parcours de découverte s'ouvre et aucun processus ne quitte en silence.
- [ ] Parcourir les six écrans, revenir en arrière et utiliser « Passer » :
      la configuration initiale reste accessible, sans CLI.
- [ ] Vérifier la lisibilité à la taille initiale puis avec la mise à l'échelle
      Windows utilisée : aucun texte superposé ni bouton principal hors fenêtre.
- [ ] Fermer puis rouvrir : la découverte terminée ne se rejoue pas ; elle
      reste accessible depuis les réglages.

## 2. Configuration, providers, modèles et profils

- [ ] Compléter l'onboarding avec un provider et un modèle disponibles ; le
      niveau et le profil choisis sont conservés après redémarrage.
- [ ] Stockage sécurisé (critère Beta) : ajouter une clé de test depuis le
      Desktop, quitter, relancer sans variable d'environnement et générer.
      La clé ne doit pas apparaître dans les réponses IPC, logs ou
      `%APPDATA%\rp\config.json`. Tester ensuite son remplacement et son retrait.
- [ ] Si DPAPI est indisponible, vérifier que l'interface propose explicitement
      la variable d'environnement correspondante, sans laisser saisir une clé
      qui échouera ensuite. Ce repli ne valide pas la ligne précédente.
- [ ] Retirer la clé active puis relancer : la réparation est proposée sans
      rejouer automatiquement la découverte, et l'erreur indique une action utile.
- [ ] Ajouter, modifier puis supprimer un endpoint compatible OpenAI de test ;
      vérifier la liste des modèles et une erreur réseau/clé invalide lisible.
- [ ] Changer provider, modèle, niveau et profil depuis les surfaces qui les
      proposent. Vérifier recherche et défilement avec plusieurs dizaines de
      profils, y compris un profil personnel créé depuis le Desktop.
- [ ] Préférences : modifier fidélité, langue de sortie, délai et tokens maximum,
      puis relancer et vérifier la persistance. Vider les tokens rétablit le
      réglage automatique.
- [ ] Vérifier que la configuration reste sous `%APPDATA%\rp`, y compris pour
      un compte dont le nom contient espaces et accents.

## 3. Tray, raccourcis, fenêtres et diagnostic

- [ ] Ouvrir le popover depuis le tray, saisir une demande et ouvrir les réglages.
      La perte de focus ferme le popover ; fermer les réglages ne quitte pas le tray.
- [ ] Déclencher les trois raccourcis **affichés dans Préférences** : capture,
      saisie libre et popover. Consigner les combinaisons réellement actives.
- [ ] Modifier un raccourci : le nouveau fonctionne sans relance. Tester un
      doublon interne et une combinaison déjà prise ; le conflit et le repli
      éventuel doivent être explicites. Suspendre, reprendre et réinitialiser.
- [ ] Ouvrir le Diagnostic : les problèmes ont une explication actionnable et
      aucun bouton ne tente d'ouvrir un volet de permissions macOS.
- [ ] La capsule reste accessible au premier plan et entièrement visible près
      des bords d'écran ; tester le second écran s'il existe.
- [ ] Changer la langue `fr`/`en` : la relance automatique rouvre les Préférences,
      et les menus natifs comme les fenêtres utilisent la langue choisie.
- [ ] Lancer une seconde instance : une fenêtre existante revient au premier
      plan, sans second tray ni perte des raccourcis.

## 4. Génération, capture et remplacement

Utiliser uniquement du texte et un presse-papiers de test. Jouer le cycle dans
au moins trois applications, par exemple Bloc-notes, un champ de navigateur et
VS Code ; relever leurs versions. Les actions système réelles restent manuelles.

- [ ] Saisie libre → génération → résultat : verdict de fidélité visible, texte
      éditable, copie du texte édité puis collage manuel correct dans la source.
- [ ] Provider indisponible, délai dépassé et annulation : retour lisible,
      fermeture possible et nouvelle génération fonctionnelle.
- [ ] Sans adaptateur de capture disponible, la saisie libre et la copie restent
      utilisables ; aucune action ne prétend avoir remplacé le texte source.
- [ ] Capture (critère Beta) : sélection active correctement récupérée ; aucune
      sélection ouvre la saisie libre. Une sélection identique au presse-papiers
      est bien distinguée de l'absence de sélection.
- [ ] Remplacement (critère Beta) : le résultat édité remplace uniquement la
      sélection d'origine, après restitution du focus à la bonne application.
      Annuler dans cette application restaure le texte initial.
- [ ] Si la source est fermée ou ne récupère pas le focus, le remplacement est
      refusé explicitement et la copie reste possible.
- [ ] Après capture/remplacement, le presse-papiers initial est intact, y compris
      sur erreur et annulation. Avec une image dans le presse-papiers, la capture
      évite toute conversion destructive ; vérifier l'image après l'essai.

## 5. Redémarrage, mise à niveau et désinstallation

- [ ] Quitter depuis le tray puis relancer : un seul processus principal,
      réglages et profils conservés, raccourcis actifs.
- [ ] Redémarrer Windows puis lancer Reqraft depuis son raccourci installé :
      mêmes réglages, aucun besoin de passer par un terminal.
- [ ] Installer la nouvelle version sur une précédente dans la session de test :
      version affichée correcte, configuration et profils conservés.
- [ ] Désinstaller depuis Windows : aucun processus ni raccourci actif ne reste.
      Relever les fichiers et credentials conservés ou supprimés, puis
      réinstaller pour documenter si l'onboarding reprend ou est déjà terminé.

## Validation automatisée et décision

Depuis le commit testé, lancer `pnpm quality`, puis `pnpm test:desktop:e2e` sur
Windows et joindre les résultats **avec le nombre de tests exécutés et ignorés**.
La suite Electron utilise un binaire direct, un profil temporaire (`HOME`,
`USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`) et un dossier Electron
séparé. Les fixtures suivent les chemins de `src/config/paths.ts`, vérifiés par
`tests/unit/desktop-process.test.ts`.

Ces E2E testent le bundle avec des services injectés ; ils ne prouvent pas la
capture native, le stockage DPAPI sur une vraie session Windows, la signature ou l'installation.
Leur exécution Windows et leur branchement en CI restent à valider. Conserver le
suffixe `-experimental` tant que les critères Windows Beta de la roadmap ne sont
pas tous atteints.
