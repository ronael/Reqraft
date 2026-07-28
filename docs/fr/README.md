# Reqraft

Transforme une demande brute en un prompt clair, fidèle et directement exploitable par un agent IA.

## Installation

```bash
npm install -g @reqraft/cli
```

## Utilisation rapide

```bash
rp "ajoute un bouton pour exporter le rapport"
```

```bash
rp init
rp init --reset
```

`rp init` configure le provider, le modèle et les préférences locales. Les clés
API ne sont jamais enregistrées dans `config.json` : Reqraft utilise les
variables d'environnement comme `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`.

```bash
rp --profile frontend "améliore la card et fait qu'elle marche mobile"
```

## Profils

- `auto` — détection locale
- `clean` — correction et clarification légère
- `code` — agents de développement
- `frontend` — implémentation frontend
- `web-design` — conception visuelle
- `debug` — débogage
- `review` — revue de code
- `writing` — rédaction générale

## Providers

Anthropic, OpenAI, DeepSeek, Mistral et OpenAI Compatible.

```bash
export ANTHROPIC_API_KEY=...
rp "ma demande" --provider anthropic --model claude-haiku-4-5
```

## Confidentialité

Aucun prompt stocké par défaut, pas de télémétrie, détection locale des secrets. Voir [docs/privacy.md](../privacy.md).
