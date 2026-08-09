# Reqraft

Transforme une demande brute en un prompt clair, fidèle et directement exploitable par un agent IA.

## Installation

```bash
npm install -g @reqraft/cli
# ou, avec pnpm :
pnpm setup  # une seule fois si le dossier global n'est pas encore configuré
pnpm add -g @reqraft/cli
```

Après `pnpm setup`, relancez le terminal avant l'installation globale.

## Utilisation rapide

```bash
rp init
rp auth login openai  # si la clé choisie n'est pas déjà dans l'environnement
rp doctor
rp
```

La dernière commande ouvre l'interface interactive. Pour une utilisation directe :

```bash
rp "ajoute un bouton pour exporter le rapport"
```

`rp init` configure le provider, le modèle et les préférences locales. Les clés
API ne sont jamais enregistrées dans `config.json` : Reqraft utilise les
variables d'environnement comme `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`, ou le
stockage sécurisé via `rp auth login <provider>`.

`rp config setup` reste un alias de `rp init`. Utilisez `rp init --reset` ou
`rp config setup --reset` pour reprendre la configuration depuis les valeurs par
défaut.

Le presse-papiers peut servir d'entrée ou de sortie :

```bash
rp --clipboard
rp "ma demande" --copy
```

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
