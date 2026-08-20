# Roadmap

Cette roadmap distingue la stabilisation, les capacités produit planifiées et
la recherche. Les éléments « Exploration » ne constituent pas un engagement de
livraison.

## Now — stabiliser 0.3.x

- Faire du dogfooding réel du CLI, du TUI et du desktop ; ne corriger que les
  régressions concrètement remontées.
- Valider manuellement les paquets macOS avant chaque release desktop.
- Garder la roadmap à jour : le bundling des dépendances du processus Electron
  (`d8f8320`) et le focus de l'éditeur TUI (`e5145cf`) sont terminés, donc ne
  sont plus des objectifs ouverts.

**Sortie :** les parcours principaux sont utilisables sans régression connue
sur les surfaces actuellement supportées.

## Next — personnalisation locale

- [Ajout de profils locaux](roadmap/ajout-profils.md) : `add`, import par
  fichier, `list` et `remove`, fondés sur un registre partagé intégrés + local.
- Rendre ces profils immédiatement disponibles dans le CLI et le TUI.

**Sortie :** un profil local créé depuis le CLI persiste, est listé, peut être
supprimé sans manipulation de fichier et peut être utilisé par le CLI et le
TUI.

## Next — desktop autonome

- Créer un onboarding desktop natif : aucun téléchargement de l'application ne
  doit imposer l'installation du CLI ou l'exécution de `rp init`.
- Rendre les paramètres modifiables depuis le desktop : provider, modèle,
  niveau, profil et préférences associées.
- Garder la configuration dans un domaine partagé : CLI (`rp init`) et desktop
  sont deux interfaces du même service, jamais l'un l'automatisation de
  l'autre.
- Passer les credentials par le processus principal Electron uniquement ; le
  renderer ne lit jamais les secrets.
- Exposer les profils locaux dans l'onboarding et dans les réglages desktop.

**Sortie :** une personne qui ouvre seulement l'application desktop peut la
configurer, modifier ses choix et générer un résultat sans passer par le CLI.

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
- Étendre l'intégration générique des fournisseurs compatibles OpenAI : clés et
  URL configurables pour OpenRouter, DeepInfra et leurs équivalents, sans
  adaptation dédiée lorsqu'ils respectent le contrat commun.
- Étudier l'inférence locale embarquée, éventuellement autour de Gemma/GEMA,
  uniquement si un besoin d'exécution hors ligne en un clic est confirmé. À
  cadrer : runtime, matériel, RAM, quantisation, licences, stockage,
  mises à jour et packaging multi-plateforme.
- Étudier le partage explicite de profils, sans introduire prématurément de
  compte utilisateur, synchronisation cloud ou marketplace.
