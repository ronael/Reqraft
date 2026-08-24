# Roadmap

Cette roadmap distingue la stabilisation, les capacités produit planifiées et
la recherche. Les éléments « Exploration » ne constituent pas un engagement de
livraison.

## Now — stabiliser 0.4.x

- Faire du dogfooding réel du CLI, du TUI et du desktop ; ne corriger que les
  régressions concrètement remontées.
- Valider manuellement les paquets macOS avant chaque release desktop.
- Garder la roadmap à jour : le bundling des dépendances du processus Electron
  (`d8f8320`) et le focus de l'éditeur TUI (`e5145cf`) sont terminés, donc ne
  sont plus des objectifs ouverts.

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
  profil, dans l'onboarding comme dans les réglages.
- Fournisseurs gérables après coup : clé ajoutée, remplacée ou retirée, et
  endpoints compatibles OpenAI créés, modifiés ou supprimés.
- Configuration dans un domaine partagé, `src/config/setup.ts` : `rp init` et
  le desktop construisent le même fichier par le même constructeur.
- Credentials traités par le processus principal seul, à travers le service
  `auth` existant ; le renderer ne reçoit jamais de valeur.

**Sortie atteinte :** une personne qui ouvre seulement l'application desktop
peut la configurer, modifier ses choix et générer un résultat sans passer par
le CLI.

## Next — passer à l'échelle des profils

- Le sélecteur de profil de la barre de menus est une liste bornée, cherchable
  et groupée par origine ; vérifier que les autres surfaces tiennent le même
  contrat quand le catalogue grandit.
- Étudier un ordre par usage récent plutôt qu'un ordre fixe, une fois qu'un
  catalogue réel existe.

**Sortie :** un catalogue de plusieurs dizaines de profils reste utilisable sur
toutes les surfaces, sans que la taille d'une fenêtre dépende du nombre de
profils.

## Later — contexte par projet

- Ajouter `.reqraft/config.json` avec une priorité claire : options CLI,
  configuration projet, configuration utilisateur, puis valeurs par défaut.
- Autoriser des profils propres au projet dans `.reqraft/profiles/`,
  versionnables avec le dépôt.
- Interdire toute credential ou secret dans `.reqraft/`.

**Sortie :** deux projets peuvent appliquer automatiquement des conventions
différentes, tout en conservant les réglages utilisateur comme repli.

## Later — fidélité et qualité

- Renforcer les benchmarks de fidélité et les cas de régression par profil.
- Améliorer les détections locales : ajout de scope, expansion
  disproportionnée, termes techniques, chemins et commandes.
- Produire des métriques comparables selon le profil et le modèle, sans perdre
  le caractère local-first du produit.

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
