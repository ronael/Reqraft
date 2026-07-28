# WORKLOG — Reqraft CLI

## Lot en cours

Identité terminal — validation finale de la branche `feat/tui-design-system`.

## Identité terminal

### Lots A et B — direction et design system

- Direction terminal-first documentée dans `docs/tui-design.md`.
- Palette sémantique, tokens, types et seuils responsive centralisés.
- Composants réutilisables ajoutés : frame, header, panneaux, badges, notices,
  état vide, métadonnées, raccourcis, sélecteur et spinner.

### Lots C et D — écran principal et interactions

- Écran principal limité à 112 colonnes, sans hauteur artificielle ni grands
  espaces vides.
- États vide, chargement, résultat, diff, explication, succès et erreur harmonisés.
- Métadonnées de durée et de tokens affichées après génération.
- Palette `Ctrl+K`, aide `?`, navigation `Esc` et raccourcis de contexte validés
  dans un pseudo-terminal réel.
- Les erreurs provider brutes sont remplacées par une prochaine action claire.

### Lots E et F — commandes et robustesse

- Titres partagés appliqués à `doctor`, `auth`, `profiles`, `providers` et `models`.
- `init` recommande désormais le coffre-fort via `rp auth login`.
- Les valeurs d'exemple comme `ta-clé` sont refusées dans la saisie et dans
  l'environnement avant tout appel provider.
- Fallback `NO_COLOR` ajouté pour les logs, pipes et terminaux non interactifs.
- Rendu manuel validé à 48 colonnes ; seuils automatisés pour 40, 52, 76 et
  120 colonnes.

### Validation

- Tests ciblés auth, erreurs, responsive et fallback couleur ajoutés.
- `pnpm exec tsc --noEmit` : succès.
- `pnpm lint` : succès.
- `pnpm test` : 16 fichiers, 102 tests réussis.
- `pnpm build` : succès, bundle ESM généré.
- Tests manuels : rendu étroit, palette, aide, retour `Esc`, commandes secondaires,
  fallback `NO_COLOR` et refus interactif d'une clé `ta-clé`.

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
- ✅ Benchmark Anthropic réel exécuté avec `claude-haiku-4-5` sur le dataset OpenAI inchangé : 40 cas, 0 échec, score moyen 0,90625, médiane 1,959 s, P95 2,926 s, 0 reasoning token et 0 sortie minimal disproportionnée.
- ✅ Anthropic Haiku validé fonctionnellement ; `gpt-4.1-mini` reste la référence de performance et de comportement OpenAI.

### Mistral Small 4 adapter

- ✅ JSON mode Mistral activé au niveau de l'adaptateur et reprise unique ajoutée pour les erreurs 503 transitoires.
- ✅ Benchmark réel sur le dataset inchangé : 40 cas, 0 échec, médiane 0,812 s, P95 1,495 s et 0 sortie minimal disproportionnée.
- ⏸️ Mistral non validé pour l'instant : score moyen 0,884375, sous le seuil de 0,90. Les règles communes n'ont pas été modifiées pour compenser ce résultat.

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
