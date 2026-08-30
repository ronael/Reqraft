# Roadmap

Cette roadmap distingue la stabilisation, les capacités produit planifiées et
la recherche. Les éléments « Exploration » ne constituent pas un engagement de
livraison.

## Now — stabiliser 0.5.x

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
  fenêtre de configuration au démarrage, sans CLI ni `rp init`.
- Paramètres modifiables depuis le desktop : provider, modèle, niveau et
  profil, dans l'onboarding, les réglages, le popover et la capsule.
- Préférences desktop : raccourcis globaux configurables avec ré-enregistrement
  à chaud, langue d'interface `fr/en` résolue au démarrage, relance automatique
  après changement de langue et retour direct aux réglages.
- Fournisseurs gérables après coup : clé ajoutée, remplacée ou retirée, et
  endpoints compatibles OpenAI créés, modifiés ou supprimés.
- Configuration dans un domaine partagé, `src/config/setup.ts` : `rp init` et
  le desktop construisent le même fichier par le même constructeur.
- Credentials traités par le processus principal seul, à travers le service
  `auth` existant ; le renderer ne reçoit jamais de valeur.
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

## Later — distribution desktop

- Signature et notarisation macOS, puis auto-update lorsque le canal de
  distribution est stabilisé.
- Évaluer Windows et Linux selon une demande réelle ; ne pas confondre un
  installateur expérimental avec une plateforme pleinement supportée.

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
