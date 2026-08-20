# Roadmap

Cette roadmap rassemble les intentions de produit. Les éléments marqués
« exploration » ne constituent pas un engagement de livraison.

## À court terme

- Fiabiliser le packaging desktop Linux : l'AppImage doit embarquer toutes les
  dépendances d'exécution du processus principal.
- Finaliser les interactions du TUI OpenTUI, notamment le focus et la
  lisibilité de l'éditeur.
- Préparer une release desktop après validation manuelle des paquets ciblés.

## Fonctionnalités prévues

- [Ajout de profils locaux](roadmap/ajout-profils.md) : démarrer par le CLI,
  avec un coeur partagé prêt à être exposé dans l'application desktop.

## Exploration

- Étudier l'intégration de GEMA pour des systèmes embarqués et une exécution
  entièrement locale. À cadrer : modèle exact, matériel cible, mémoire,
  distribution et licences.
- Concevoir un onboarding natif pour le desktop. Aujourd'hui, le premier
  paramétrage est porté par `rp init` côté CLI ; l'objectif est que le desktop
  puisse guider la configuration initiale et modifier les paramètres ensuite,
  via une configuration partagée plutôt qu'en dépendant du CLI.
