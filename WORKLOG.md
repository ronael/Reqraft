# WORKLOG — Reqraft CLI

## Lot en cours

Publication — en attente de l'OTP npm ou de la configuration du token d'automation.

## Terminé

### Optimisation OpenAI / init dev

- ✅ Correction du cas où OpenAI consomme toute la limite de sortie en reasoning tokens sans produire de texte visible.
- ✅ Les réponses provider vides provoquent maintenant une erreur claire et un code de sortie non nul.
- ✅ Les statistiques sont affichées sur stderr, séparées du prompt reformulé écrit sur stdout.
- ✅ Les stats distinguent entrée, sortie visible, raisonnement et sortie totale lorsque le provider les communique.
- ✅ `gpt-4.1-mini` ajouté comme preset OpenAI recommandé pour le reprompting rapide.
- ✅ Cas de test validé en dev avec OpenAI : 3.05 s, 232 tokens d'entrée, 177 tokens de sortie visible, 0 token de raisonnement.
- ✅ Garde-fous de fidélité ajoutés pour éviter l'expansion non demandée des prompts courts.
- ✅ Cas landing page Apple revalidé : 2.11 s, 329 tokens d'entrée, 31 tokens de sortie visible, 0 token de raisonnement.
- ✅ Stratégie OpenAI-first adoptée : `gpt-4.1-mini` sert de référence avant validation des autres providers.
- ✅ Modes de fidélité préparés (`permissive`, `balanced`, `strict`) avec `balanced` par défaut.
- ✅ `--explain` corrigé : prompt sur stdout, explications sur stderr.
- ✅ Dataset de benchmark fidélité ajouté avec 40 cas.
- ✅ Contrat provider documenté dans `docs/provider-contract.md`.
- ✅ Référence OpenAI figée avec `gpt-4.1-mini` : benchmark de 40 cas, 0 échec, score moyen 0,975, 35 cas à 1,00, médiane ~1,1 s, P95 ~3,2 s et 0 reasoning token.
- ✅ Dataset de 40 cas conservé comme suite de référence, avec régressions explicites pour landing page Apple, page login, formulaire responsive, `refactor` / `refactore` et `PR` / `pull request`.
- ✅ Payload OpenAI et limites de responsabilité documentés dans `docs/provider-contract.md`; les règles de profils, niveaux et fidélité restent dans le moteur commun.
- ⏭️ Prochain lot : Anthropic Haiku, avec le même dataset et sans modification des règles communes pour influencer le score.

### Anthropic Haiku adapter

- ✅ Payload Anthropic Messages validé par tests mockés : endpoint, headers, `max_tokens`, `temperature`, `system`, message utilisateur et propagation de `stream`.
- ✅ Extraction SSE ajoutée : agrégation des `text_delta`, remontée des tokens d'entrée/sortie et erreurs de flux converties en `ProviderError`.
- ✅ Contrat et commande de benchmark Anthropic documentés dans `docs/provider-contract.md`.
- ⏸️ Benchmark Anthropic réel en attente de `ANTHROPIC_API_KEY` dans le shell ; aucune clé n'a été affichée ni enregistrée.

### Lots A à K

- Tous les lots implémentés, validés et commités.

### Publication

- ✅ Vérification de la disponibilité du nom `@reqraft/cli` sur npm (disponible).
- ✅ Branche `main` créée/mergée avec `develop` et poussée.
- ✅ Tag `v0.1.0` créé et poussé.
- ✅ Workflow GitHub Actions `.github/workflows/publish.yml` ajouté.
- ✅ `package.json` corrigé avec `npm pkg fix` (chemins `bin` normalisés).
- ✅ Release GitHub `v0.1.0` créée : https://github.com/ronael/Reqraft/releases/tag/v0.1.0
- ❌ Publication npm bloquée par l'OTP 2FA du compte npm.

## Reste à faire

- Fournir l'OTP npm ou configurer un `NPM_TOKEN` d'automation dans les secrets GitHub.
- Relancer `npm publish --otp=<code>` ou déclencher le workflow GitHub Actions.

## Commandes exécutées

- `npm view @reqraft/cli` → 404, nom disponible.
- `git checkout main && git merge develop && git push origin main` → succès.
- `git tag -a v0.1.0 && git push origin v0.1.0` → succès.
- `npm pkg fix` → chemins `bin` corrigés.
- `gh release create v0.1.0` → release créée.
- `npm publish --access public` → échec, OTP requis.

## Décisions techniques

- Workflow de publication automatisée déclenchée par les tags `v*`.
- Le workflow attend le secret `NPM_TOKEN` pour publier automatiquement.

## Prochaine action

Attendre l'OTP ou le token npm de l'utilisateur pour finaliser la publication.
