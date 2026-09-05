# Roadmap

Cette roadmap distingue la stabilisation, les capacités produit planifiées et
la recherche. Les éléments « Exploration » ne constituent pas un engagement de
livraison.

## Now — stabiliser 0.6.0

- Faire du dogfooding réel du CLI, du TUI et du desktop ; ne corriger que les
  régressions concrètement remontées.
- Valider manuellement les paquets macOS avant chaque release desktop, en
  déroulant [la checklist de test manuel desktop macOS](desktop-macos-manual-checklist.md).
- Premiers tests desktop automatisés en place : le bundle Electron réel couvre
  le démarrage, l'ouverture de la capsule, le service mock, le raccourci
  indisponible et la seconde instance. Les permissions refusées et le
  presse-papiers image restent des tests d'intégration injectés : les jouer sur
  l'OS modifierait les permissions, les frappes ou le presse-papiers de la
  machine qui lance la suite.
- `pnpm test:desktop:packaged` construit le vrai paquet macOS et vérifie son
  démarrage, son nom produit, ses fenêtres persistantes et ses raccourcis dans
  un environnement isolé. La revue visuelle et les interactions OS restent
  manuelles.
- Valider manuellement le cycle macOS réel : permissions Accessibilité et
  Automatisation, capture, remplacement, relance après changement de langue,
  popover et raccourcis configurés — couvert par la
  [checklist de test manuel desktop macOS](desktop-macos-manual-checklist.md).

**Sortie :** les parcours principaux sont utilisables sans régression connue
sur les surfaces actuellement supportées.

## Livré — personnalisation locale

- [Ajout de profils locaux](roadmap/ajout-profils.md) : `add`, import par
  fichier, `list` et `remove`, fondés sur un registre partagé intégrés + local.
- Ces profils sont disponibles dans le CLI et le TUI.

**Sortie atteinte :** un profil local créé depuis le CLI persiste, est listé,
peut être supprimé sans manipulation de fichier et peut être utilisé par le CLI
et le TUI.

## Livré — desktop autonome

- Onboarding desktop natif : une installation sans configuration ouvre une
  présentation de découverte en six écrans, puis une fenêtre de configuration
  au démarrage, sans CLI ni `rp init`. La présentation est vue une fois par
  installation, y compris par une personne déjà configurée, puis reste
  accessible depuis les réglages. Une installation qui perd une clé arrive
  directement à la réparation sans rejouer automatiquement la présentation.
- Paramètres modifiables depuis le desktop : provider, modèle, niveau et
  profil, dans l'onboarding, les réglages, le popover et la capsule.
- Résultat éditable directement dans la capsule avant copie ou remplacement ;
  la comparaison reflète la version modifiée et le processus principal valide
  le texte avec le `runId` dans une seule opération IPC.
- Retours d'actions transitoires unifiés dans un toast partagé, superposé au
  contenu de la capsule, du popover et des réglages afin de rester visible sur
  les résultats longs sans déplacer l'interface.
- Préférences desktop : raccourcis globaux configurables avec ré-enregistrement
  à chaud, langue d'interface `fr/en` résolue au démarrage, relance automatique
  après changement de langue et retour direct aux réglages.
- Fournisseurs gérables après coup : clé ajoutée, remplacée ou retirée, et
  endpoints compatibles OpenAI créés, modifiés ou supprimés.
- Configuration dans un domaine partagé, `src/config/setup.ts` : `rp init` et
  le desktop construisent le même fichier par le même constructeur.
- Credentials traités par le processus principal seul, à travers le service
  `auth` existant ; le renderer ne reçoit jamais de valeur.
- Mises à jour visibles sans installation silencieuse : le desktop vérifie la
  dernière GitHub Release, l'annonce une fois par version par notification
  native et l'expose dans le tray et les réglages ; le paquet npm vérifie le
  registre après une commande interactive réussie, sur stderr et avec cache.
- Robustesse de surface : capsule recréée si détruite, fenêtre persistante
  cachée plutôt que fermée, seconde instance qui remet une fenêtre existante au
  premier plan et version affichée depuis `src/version.ts`.

**Sortie atteinte :** une personne qui ouvre seulement l'application desktop
peut la configurer, modifier ses choix et générer un résultat sans passer par
le CLI.

## Next — passer à l'échelle des profils

- ~~Vérifier que les sélecteurs de profil du desktop, du CLI et du TUI tiennent
  le même contrat quand le catalogue grandit : liste bornée, recherche et
  groupement par origine.~~ Fait, et l'écart trouvé a été comblé : la TUI n'avait
  pas de recherche, et sa liste ne suivait pas le surlignage au-delà de la
  hauteur du dialogue. Le contrat commun est tenu par un test
  (`tests/unit/profile-picker-scale.test.ts`).
- ~~Étudier un ordre par usage récent plutôt qu'un ordre fixe.~~ Fait :
  [Ordering the profile list](profile-ordering.md). Conclusion : pas maintenant,
  et pas sous forme d'usage récent. Une liste qui se réordonne entre deux
  ouvertures détruit la mémoire gestuelle, la recherche absorbe déjà l'essentiel
  du besoin, et l'ordre par usage demande un journal, une décroissance et une
  écriture disque sur le chemin chaud. Deux changements moins chers couvrent le
  besoin : garder un ordre fixe et rendre la recherche visible, ce que la TUI
  fait désormais. Épingler un profil reste différé tant que toutes les surfaces
  ne reçoivent pas explicitement le même profil configuré par défaut.

**Sortie :** un catalogue de plusieurs dizaines de profils reste utilisable sur
toutes les surfaces, sans que la taille d'une fenêtre dépende du nombre de
profils.

## Livré — contexte par projet

- `.reqraft/config.json`, trouvé en remontant depuis le dossier courant, avec la
  priorité annoncée : options CLI, configuration projet, configuration
  utilisateur, valeurs par défaut. La couche projet recouvre clé par clé, et
  tout ce qui écrit part de la configuration utilisateur — une valeur venue d'un
  projet ne devient jamais permanente.
- Profils propres au projet dans `.reqraft/profiles/`, versionnables avec le
  dépôt, en lecture seule depuis toutes les surfaces. Ils l'emportent sur un
  profil personnel du même identifiant, qui est alors signalé comme masqué
  plutôt qu'effacé.
- Aucune credential possible dans `.reqraft/` : le schéma est strict et refuse
  `customHeaders`, les réglages qui appartiennent à la personne ou à sa machine,
  et toute clé inconnue — bruyamment, jamais en silence.
- Le desktop n'a pas de projet : son dossier courant est celui du lanceur, pas
  un choix.

Documenté dans [Project context](project-context.md).

**Sortie atteinte :** deux projets peuvent appliquer automatiquement des
conventions différentes, tout en conservant les réglages utilisateur comme
repli.

## Later — fidélité et qualité

- ~~Améliorer les détections locales : chemins et commandes.~~ Fait : un chemin
  ou une commande présents dans la sortie et absents de la demande sont
  signalés, nommément, dans le CLI comme dans la capsule. Ce sont les
  inventions les plus coûteuses — elles ont l'air d'un fait vérifié, et
  quelqu'un les exécutera — et ce sont les seules qui se vérifient sans
  ambiguïté. Le repérage est volontairement conservateur, et un test le tient
  silencieux sur les 46 cas du jeu de données.
- ~~Produire des métriques comparables selon le profil et le modèle.~~ Fait :
  le benchmark rend un tableau par profil, `pnpm benchmark:compare` donne
  l'écart entre deux exécutions profil par profil, et refuse de comparer deux
  scores calculés par des règles différentes.
- ~~Renforcer les cas de régression par profil.~~ Fait pour le corpus écrit à la
  main : dix-huit cas générés à partir de cinq entrées répétées sont remplacés
  par dix-neuf cas spécifiques, chacun nommant une dérive plausible. Le corpus
  compte 42 cas, cinq à huit par profil, et le test vérifie profils, niveaux et
  absence de doublon plutôt qu'un simple compte.
- ~~Renforcer les benchmarks de fidélité.~~ Fait en partie : `intention` et
  `profile` valaient 1 quoi qu'il arrive, ce qui remontait chaque total de 0,4
  et rendait deux modèles indiscernables sur près de la moitié du score.
  `profile` est retiré — il mesurait ce que le runner imposait — et `intention`
  mesure désormais ce qui survit des mots porteurs de sens.
- ~~Vérifier la conservation des termes techniques.~~ Fait : chemins,
  commandes, URLs, flags, variables d'environnement, identifiants, versions et
  endpoints fournis puis perdus sont signalés nommément. Le même extracteur
  alimente le score de conservation du benchmark (règles version 3).
- Reste : l'ajout de scope général, encore adossé à une liste de termes produit
  plutôt qu'à une vérification sémantique fiable. Et des cas de régression par
  profil, à écrire à partir de vraies sorties de modèle.

**Sortie :** une suite de régression démontre que Reqraft améliore la forme
d'une demande sans dégrader son intention.

## Next — rendre Windows réellement utilisable

Les premières exécutions manuelles sur Windows ont commencé. Elles confirment
que construire et ouvrir l'installateur ne suffit pas encore à déclarer la
plateforme supportée. L'artefact reste **Alpha** et conserve son suffixe
`-experimental` jusqu'à validation de tout le parcours ci-dessous.

- Écrire une checklist Windows reproductible : installation propre, premier
  lancement, onboarding, providers, modèles, profils, réglages, diagnostic,
  raccourcis globaux, redémarrage et désinstallation.
- Implémenter des adaptateurs Windows pour capturer la sélection active et
  remplacer le texte dans l'application source. Garder le même contrat
  `CaptureService` que macOS et isoler les API Windows dans `desktop/main`, sans
  condition de plateforme dans le domaine, le CLI ou les renderers.
- Ajouter un stockage sécurisé dans Windows Credential Manager. Les variables
  d'environnement restent un repli explicite, pas l'unique méthode de
  configuration de l'application.
- Vérifier le comportement natif du tray, des raccourcis, du presse-papiers, de
  la fenêtre toujours au premier plan, du focus rendu à l'application source et
  des chemins de configuration Windows.
- Faire tourner en CI Windows les scénarios Electron qui n'agissent pas sur le
  bureau réel : démarrage du paquet, onboarding, IPC, réglages, providers,
  modèles, profils et diagnostic. La capture et la réinjection restent des tests
  manuels ou des tests sur machine Windows dédiée tant qu'ils pilotent la session
  graphique de l'utilisateur.
- Documenter les limites SmartScreen et signer l'installateur avant de passer
  de l'Alpha à la Beta. Brancher ensuite le même canal de mise à jour explicite
  que macOS, puis seulement l'installation automatique.

**Critère de sortie Windows Beta :** une installation issue d'une release
signée passe la checklist sur une machine Windows propre ; capture,
reformulation, copie et remplacement fonctionnent dans plusieurs applications ;
les scénarios automatisables sont verts en CI ; aucune régression CLI ou macOS
n'est introduite.

### Travail depuis plusieurs machines

- Une conversation lancée sur Windows part du dernier `origin/main` et traite
  un seul problème observable ou un seul lot cohérent.
- Elle ajoute un test de régression lorsque le comportement est automatisable,
  exécute les tests ciblés puis `pnpm quality`, et produit des commits sans
  mélanger captures locales, artefacts de build ou changements non liés.
- Avant intégration, relire les commits depuis la branche principale et rejouer
  la batterie commune. Les constats dépendants de Windows doivent inclure la
  version de Windows, l'architecture, le parcours exact et une capture lorsque
  l'écart est visuel.

## Later — distribution desktop

- Signature et notarisation macOS, puis téléchargement et installation
  automatiques. La détection et le lien vers la release sont déjà livrés ; le
  remplacement automatique du binaire attend un paquet signé et un canal de
  publication compatible avec l'updater.
- Le bouton principal du site détecte déjà la plateforme et propose le DMG
  macOS, l'EXE Windows ou l'AppImage Linux correspondant. Conserver un choix
  manuel visible et ne jamais proposer un binaire desktop aux plateformes
  mobiles ou inconnues.
- Évaluer Linux selon une demande réelle ; ne pas confondre un installateur
  expérimental avec une plateforme pleinement supportée.

**Sortie :** les plateformes déclarées supportées ont un parcours
d'installation, de mise à jour et de diagnostic testé.

## Exploration

- Créer un onboarding « Local » capable de détecter ou de configurer Ollama et
  LM Studio, afin d'obtenir une exécution locale sans embarquer un modèle.
- Étendre l'intégration générique des fournisseurs compatibles OpenAI :
  largement couvert depuis que les réglages desktop déclarent un endpoint
  (identifiant, URL de base, variable de clé). OpenRouter, DeepInfra et leurs
  équivalents ne demandent plus de code dédié tant qu'ils respectent le
  contrat commun ; reste à valider chacun en conditions réelles.
- Étudier l'inférence locale embarquée, éventuellement autour de Gemma/GEMA,
  uniquement si un besoin d'exécution hors ligne en un clic est confirmé. À
  cadrer : runtime, matériel, RAM, quantisation, licences, stockage,
  mises à jour et packaging multi-plateforme.
- Étudier le partage explicite de profils, sans introduire prématurément de
  compte utilisateur, synchronisation cloud ou marketplace.
