# Confidentialité

Reqraft est conçu pour rester local et respectueux de la vie privée.

## Données utilisateur

- Aucun prompt n'est conservé par défaut.
- Aucune télémétrie n'est envoyée par défaut (`telemetry: false`).
- Les clés API sont lues depuis les variables d'environnement ou le stockage sécurisé du système, et ne sont jamais écrites dans `config.json` ni dans les logs.
- Le presse-papiers est lu et écrit uniquement lorsque vous le demandez explicitement.

## Détection des secrets

Avant chaque envoi à un provider, Reqraft analyse localement le texte pour détecter :

- les tokens GitHub (`ghp_...`, `gho_...`, etc.) ;
- les clés API OpenAI (`sk-...`) ;
- les clés API Anthropic (`sk-ant-...`) ;
- les clés AWS (`AKIA...`) ;
- les clés privées ;
- les variables nommées `SECRET`, `TOKEN`, `PASSWORD` ou `API_KEY`.

En mode interactif, une confirmation est demandée. En mode non interactif, utilisez `--redact-secrets` ou `--force`.

## Providers

Les appels se font directement aux API des providers via `fetch`. Aucun serveur intermédiaire n'est utilisé.
