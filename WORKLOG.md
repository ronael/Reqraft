# WORKLOG — Reqraft CLI

## Lot en cours

Refonte TUI (DA.md) — **Lots A, B et C terminés**, Lot D en cours.

### Lot C — Écran principal

L'écran principal suit désormais la hiérarchie de la maquette : header avec
version, baseline et pastille d'état ; panneau « Prompt original » avec compteur
lignes/mots dans l'en-tête ; barre de contexte ; panneau « Prompt amélioré »
dont le ton suit le déroulé (violet en cours, émeraude au succès, rose à
l'échec) et dont l'en-tête affiche tokens et durée.

`SectionCard` est remplacé par `Panel` partout, modales comprises.

Champ de saisie multiligne (`prompt-field.tsx`) : `ink-text-input` étant
monoligne, les lignes validées sont rendues au-dessus et la dernière reste
éditable. `resolveSubmit` est câblé — Entrée génère, `\` final passe à la ligne.

`AppState.error` passe de `string` à `UiError` structuré, et `ErrorState`
remplace le `Notice` générique dans le panneau résultat : titre, message, cause,
action suivante (§13).

Barre de raccourcis reconstruite sur `KeyHint` via `shortcut-hints.ts` : les
actions indisponibles restent visibles mais grisées pour que la barre ne
reflowe pas, et pendant une génération elle se réduit à « ^C Interrompre ».

Modules purs ajoutés, tous testés : `header-status.ts`, `result-meta.ts`,
`shortcut-hints.ts`, `prompt-input.ts`.

Vérification manuelle du §2 : `stdout` ne contient que le prompt (12 octets pour
`[mock] test`), les stats restent sur `stderr`.

Validation : `pnpm quality` exit 0 — 36 fichiers, 282 tests, couverture 61,9 %.

Reste au lot C : streaming progressif et `Ctrl+C` interrupteur, qui demandent
le câblage `AbortController` jusqu'aux adaptateurs.

### Lot B — Composants de base

Composants créés : `panel.tsx` (l'unité structurelle de la maquette : bordure,
en-tête à deux zones titre/métadonnées, ton porté par la bordure et le titre),
`badge.tsx` (`Badge` + `StatusPill`), `key-hint.tsx`, `error-state.tsx`,
`toast.tsx`. `empty-state.tsx` reprend le glyphe flèche.

`ui/errors.ts` produit désormais un `UiError` structuré — titre, message, cause,
action suivante — comme l'exige le §13. `formatUiError` devient un aplatissement
pour les surfaces à une seule ligne, donc les appelants existants et leurs tests
restent valides.

Le toast réserve sa ligne en permanence : son apparition ne décale plus la mise
en page (§15).

Dette supprimée : `status-badge.tsx` faisait doublon avec `badge.tsx`, il est
retiré et `app.tsx` migré.

**Generate** — le binding `Ctrl+\r` est retiré de `ui/shortcuts.ts` : il ne
pouvait jamais se déclencher. `ui/prompt-input.ts` porte la logique pure,
`resolveSubmit` (Enter génère, `\` final insère un saut de ligne et n'apparaît
jamais dans le prompt) et `describeInput` (compteur lignes/mots de l'en-tête).
Le rendu multiligne réel demande un champ de saisie maison, `ink-text-input`
étant monoligne : câblage au lot C, pour ne pas injecter un `\n` dans un champ
incapable de l'afficher.

`ink-testing-library` ajouté en devDependency : le §26 réclame des tests de
composants, et `src/ui/components` était à 0 %. 14 tests de rendu ajoutés ; les
nouveaux composants sont à 100 %.

Validation : `pnpm quality` exit 0 — 35 fichiers, 264 tests, couverture 61,72 %.

Prochaine action : Lot C, écran principal — champ multiligne, streaming,
panneaux au format maquette, `Ctrl+C` interrupteur.

### Lot A — Audit et fondations

Audit complet dans `docs/tui-implementation.md`. Constat principal : seuls les
écrans 1 à 11 de `reqraft-cli-ui.html` sont en Ink ; les écrans 12 à 31 (`init`,
`doctor`, `config`, listes, confirmations) sont du `console.log` et du
`readline`. Les lots E et F sont donc un portage, pas un restylage — reportés
après validation du design system.

Fichiers créés : `src/ui/theme/capabilities.ts`, `src/ui/theme/symbols.ts`,
`tests/unit/theme.test.ts`, `tests/unit/responsive.test.ts`,
`docs/tui-implementation.md`, `docs/code-quality.md`.

Fichiers réécrits : `src/ui/theme/types.ts`, `palette.ts`, `tokens.ts`,
`src/ui/layout/responsive.ts`, `src/ui/hooks/use-terminal-size.ts`,
`docs/tui-design.md`.

Décisions de design, détaillées dans `docs/tui-implementation.md` :

- **Enter génère, `\` + Enter insère un saut de ligne.** `Ctrl+Enter` est
  indistinguable d'`Enter` dans la quasi-totalité des terminaux ; le binding
  mort `Ctrl+\r` sera retiré au lot C plutôt qu'affiché.
- Accent **violet** `#a78bfa` / `#8b5cf6`, repris de la maquette.
- Le texte courant n'impose aucune couleur : le premier plan du terminal est
  hérité, pour rester lisible en thème clair.
- Les valeurs contextuelles (provider, modèle, profil, niveau) redeviennent
  neutres. La couleur est réservée au focus et au statut.
- `Ctrl+C` interrompra une génération en cours (à câbler au lot C).
- Baseline retenue : « Shape the request. Keep the intent. »

Écarts assumés avec le HTML : fonds teintés, ombres et halos non portés (§21
interdit de présumer un fond) ; chrome de fenêtre de la maquette ignoré ;
`Ctrl+Shift+C` remplacé par `Ctrl+Y`, la plupart des émulateurs interceptant
cette combinaison.

Robustesse ajoutée : repli ASCII complet (symboles et bordures `classic`) sous
locale non UTF-8 ou console Windows héritée ; mode monochrome sous `NO_COLOR`,
`TERM=dumb` ou hors TTY ; `normalizeSize` corrige le `undefined` que Node
renvoie pour `stdout.columns` hors TTY ; `getHeightMode` prépare le §17.

Doublon supprimé : `shouldUseColor` de `ui/text.ts` déléguait la même logique
que `detectColor` ; le renderer non interactif et le thème TUI répondent
désormais de façon identique.

Validation : `pnpm quality` exit 0 — 33 fichiers, 242 tests, couverture 60,25 %.

Prochaine action : Lot B, composants de base sur ces tokens.

### Nettoyage Sonar

Analyse serveur retirée (coût non justifié) : `scripts/`,
`sonar-project.properties`, workflow `sonar.yml`, dépendance `@sonar/scan` et
`tests/unit/sonar-env.test.ts` supprimés. `eslint-plugin-sonarjs` conservé, 272
règles actives, documenté dans `docs/code-quality.md`.

### Qualité professionnelle — branche `refactor/professional-cli-quality`

### Contrat de résultat et politiques

- Les réponses provider utilisables ne sont plus masquées par les contrôles de
  fidélité après consommation des tokens.
- Les alertes sont structurées en `good`, `review` et `risky`, visibles dans le
  TUI, sur stderr et dans la sortie JSON.
- `--fail-on-quality` permet aux automatisations d’échouer sans supprimer la
  réponse écrite sur stdout.
- Timeouts, budgets adaptatifs, réserves par niveau et seuils de fidélité sont
  centralisés et documentés dans `src/core/reprompt-policy.ts`.
- Le timeout est réellement propagé aux appels réseau de tous les providers,
  y compris la validation des identifiants.
- Les capacités modèle OpenAI pilotent désormais `temperature`,
  `reasoning_effort` et la limite de sortie depuis un module dédié.

### Qualité et SonarQube

- Suite `pnpm quality` ajoutée : TypeScript, ESLint, tests avec couverture et
  build de production.
- Baseline Prettier normalisée et contrôle de format intégré à la suite qualité.
- Analyse SonarQube ajoutée avec rapport LCOV et quality gate bloquante.
- Workflow GitHub Actions compatible Node.js 20, SonarQube Cloud et serveur
  auto-hébergé ; l’analyse des pull requests reste activable selon l’édition.
- Baseline de couverture assumée : 42,74 % sur tout `src`, plus de 92 % sur le
  cœur commun. Le TUI et les commandes historiques restent la dette principale.

### Validation du lot

- `pnpm quality` : 18 fichiers, 114 tests réussis, couverture LCOV et build OK.
- E2E isolés de la vraie configuration macOS, Linux et Windows via un HOME
  temporaire.
- Benchmark OpenAI réel du 29 juillet 2026 : 40 cas, 0 échec, score moyen
  0,98125, médiane 1,036 s, P95 2,186 s.
- 37 résultats `good`, 3 résultats `review`, 0 résultat `risky`; toutes les
  réponses sont restituées.
- Démarrage et fermeture du TUI de production vérifiés dans un pseudo-terminal.
- `pnpm sonar` sans token : échec explicite attendu, sans fuite de secret.

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
