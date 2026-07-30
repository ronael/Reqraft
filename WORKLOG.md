# WORKLOG — Reqraft CLI

## Lot en cours

Audit de reprise OpenTUI — stratégie retenue : refactorisation progressive avec
remplacement du renderer principal, pas réécriture du projet. Le produit actif
reste Ink ; `spikes/opentui` est un prototype Bun mocké, utile comme preuve de
capacité mais non connecté au moteur réel.

Document ajouté : `docs/tui-opentui-recovery-audit.md`.

Tests manuels effectués hors sandbox : `pnpm dev "corrige cette phrase"
--provider mock --stats`, `pnpm dev doctor`, `pnpm dev profiles`,
`pnpm dev models`, `pnpm dev providers`, `pnpm dev init`, `pnpm dev`.
Constats clés : commandes non interactives OK ; init reste readline ; TUI active
Ink ; picker profil OK ; l'éditeur multiline actuel reste fragile ; aucune
intégration OpenTUI réelle dans le package principal.

Validation à lancer après ce lot : `pnpm exec tsc --noEmit`, `pnpm lint`,
`pnpm test`, `pnpm build`.

Refonte TUI (DA.md) — **Lots A, B, C, D et G terminés**, lots E et F à venir.

### Correction des raccourcis clavier

Ctrl+M ne produisait qu'un Entrée. Cause : `Ctrl+lettre` vaut le code de la
lettre moins 64, et M donne 13, soit CR. Ink résout `\r` avant même
d'envisager une combinaison ctrl, donc `key.ctrl` reste faux et la touche est
indistinguable d'Entrée. Quatre touches sont dans ce cas : H (Backspace),
I (Tab), J (LF) et M (CR). DA.md §7 listait pourtant `Ctrl+M` pour le modèle.

Le sélecteur de modèle passe sur **Ctrl+O**. `RESERVED_CTRL_KEYS` recense les
quatre touches inutilisables et un test vérifie qu'aucun binding ni aucun
libellé de la barre ne les emploie.

**Deuxième bug, introduit par moi au lot précédent.** `render` d'Ink applique
`exitOnCtrlC: true` par défaut et ne transmet alors jamais Ctrl+C à `useInput` :
l'interruption livrée juste avant était du code mort. `cli.tsx` passe désormais
`exitOnCtrlC: false`, et Ctrl+C est résolu avant le test de modale pour
fonctionner depuis n'importe quel état, comme le §7 l'exige.

**Troisième défaut, latent.** `ink-text-input` ne filtre que les flèches, Ctrl+C
et Tab ; toute autre combinaison ctrl voit sa lettre insérée dans la valeur.
Comme Ink appelle le handler du champ avant celui de l'app, chaque raccourci
laissait sa lettre dans le prompt. Ce qui sauvait la mise était `pinInput`, qui
restaure la valeur d'avant la frappe — un invariant porteur mais nulle part
exprimé. Toutes les intentions déclenchées par une touche ctrl portent
maintenant `preserveInput`, `toggle-diff` compris, et un test énumère les
touches liées pour que ça reste vrai.

Validation : `pnpm quality` exit 0 — 41 fichiers, 369 tests, couverture 63,75 %.

### Correction du streaming

Trois défauts constatés en usage réel, captures à l'appui.

**Le JSON brut s'affichait.** Erreur de conception de ma part : je diffusais ce
que le provider envoie, or il envoie une enveloppe JSON, pas de la prose. On
voyait `{"rewritten":"… :\n\n– Objectif…"}` avec les échappements littéraux,
puis une bascule brutale vers le résultat formaté.

`core/stream-preview.ts` extrait la valeur de `rewritten` au fil de
l'assemblage et décode les échappements. `rewritten` étant déclaré en premier
dans le prompt, la prose apparaît presque immédiatement. Trois garde-fous : une
séquence coupée par la frontière de chunk n'est jamais émise à moitié décodée,
les champs arrivant dans le désordre font attendre au lieu de fuir du JSON, et
un provider ignorant la consigne JSON voit son texte affiché tel quel. Onze
tests, dont un qui rejoue le flux caractère par caractère pour vérifier qu'aucune
étape ne laisse échapper de `\` ni de `u00`.

**Le temps mort.** `GenerationMeta` affiche la phase et le temps écoulé — « envoi
· 0.8 s » puis « réception · 1.4 s ». Il possède son propre intervalle, donc
l'horloge ne rerend pas l'écran autour (§22).

**Le saut de hauteur.** `Panel` accepte `minBodyHeight` ; le panneau résultat
garde 8 lignes en permanence et ne bondit plus de 2 à 20. Pendant le flux,
`clipTailLines` garde la fin du texte et non le début, sinon la vue se figeait
dès que la réponse dépassait le budget.

Le spinner passe en braille avec repli ASCII de même largeur.

Quatre tests de rendu verrouillent le cas exact constaté : l'enveloppe JSON ne
doit jamais atteindre l'écran.

Validation : `pnpm quality` exit 0 — 41 fichiers, 350 tests, couverture 63,67 %.

### Streaming réel

Constat : le streaming n'existait pas. OpenAI ne le faisait pas du tout, et
Anthropic appelait `await response.text()` avant de parser le SSE — il
attendait donc le corps complet. `stream: true` ne changeait rien pour
l'utilisateur.

`providers/sse.ts` lit le corps de façon incrémentale. `createLineSplitter`
gère les lignes coupées entre deux chunks réseau, ce qui est le piège classique
du SSE : un fragment JSON peut arriver en deux morceaux.

`ProviderRequest.onDelta` traverse le moteur et le cas d'usage jusqu'à l'app.
L'accumulateur Anthropic est partagé entre le chemin incrémental et le chemin
bufferisé, donc les deux s'accordent forcément sur l'interprétation du flux.

Dans l'interface, le spinner cède la place au texte dès le premier fragment,
suivi de « … réception des tokens ». Les providers qui ne diffusent pas
n'envoient jamais de fragment et gardent le spinner — aucune régression.

Validation : `pnpm quality` exit 0 — 40 fichiers, 328 tests, couverture 62,67 %.

Étendu ensuite aux cinq providers. `providers/openai-stream.ts` porte
l'accumulateur du dialecte `chat/completions`, partagé par OpenAI et
OpenAI-compatible ; DeepSeek et Mistral délèguent à ce dernier et en héritent
sans modification. Les quatre providers de cette famille ne peuvent donc pas
diverger.

Deux détails qui comptent : OpenAI reçoit `stream_options.include_usage`, sans
quoi le flux ne porte aucune donnée d'usage et le panneau de stats se vide dès
qu'on active le streaming ; et les tokens de raisonnement, facturés mais jamais
affichés, sortent du compte visible comme dans le chemin bufferisé.

`stream_options` n'est pas envoyé sur OpenAI-compatible : les passerelles
auto-hébergées le supportent inégalement, l'usage reste donc ce que l'endpoint
veut bien donner.

Validation finale : `pnpm quality` exit 0 — 40 fichiers, 335 tests,
couverture 62,68 %.

### Lot G — Responsive et robustesse

Bug réel trouvé par les tests de rendu : à 80 colonnes le header débordait, Ink
rognait l'identité (« reqraf ») et les deux côtés se percutaient. Le mode
`wide` démarre à 76, mais le header complet a besoin d'environ 96 avec un
identifiant de modèle long. Le seuil grossier est remplacé par `getHeaderLayout`,
qui mesure la place réelle et lâche la baseline puis le modèle, dans l'ordre de
priorité du §16. L'identité et l'état ne sont jamais sacrifiés.

`viewport.ts` : `clipLines` borne le résultat aux lignes disponibles et
retourne le nombre de lignes masquées — le §18 interdit de tronquer
silencieusement, donc le panneau affiche « … N lignes masquées · ^Y copie le
résultat complet ». La valeur sous-jacente n'est jamais amputée, la copie rend
tout. `resultRowBudget` calcule la place selon la hauteur du terminal.

Tests de rendu aux largeurs 40, 60 et 80. Le cas 120 reste couvert par les
tests purs : `ink-testing-library` câble un terminal de 100 colonnes en dur, un
cadre de 112 ne peut pas y être dessiné.

Aide de rendu factorisée dans `tests/helpers/render.tsx`, dupliquée entre deux
fichiers de tests.

Validation : `pnpm quality` exit 0 — 39 fichiers, 315 tests, couverture 62,56 %.

### Lot D — Sélecteurs et overlays

`SelectList` remplace `ink-select-input`, qui ne savait ni filtrer ni faire
défiler. Le §9 réclamait trois choses absentes : recherche locale, défilement
quand la liste dépasse la hauteur, et marquage de l'élément en cours.

Logique pure dans `select-list.ts` : `filterItems` (insensible à la casse et
aux accents, cherche aussi dans la description — « recommande » trouve
« recommandé »), `moveIndex` (navigation circulaire), `computeWindow` (fenêtre
centrée sur l'élément actif, avec indicateurs ↑ ↓). 14 tests, dont un qui
vérifie sur les 20 positions que l'élément actif ne sort jamais de la fenêtre.

La recherche n'apparaît qu'à partir de 8 entrées : filtrer trois niveaux coûte
plus que ça ne rapporte.

L'élément courant est marqué `●` contre `○`, donc on voit ce qu'on s'apprête à
changer. `AppModal` reçoit profil, niveau, provider et modèle courants.

Dépendance `ink-select-input` retirée.

Validation : `pnpm quality` exit 0 — 37 fichiers, 296 tests, couverture 61,22 %.

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

### POC OpenTUI isolé

- ✅ Création d'un POC OpenTUI dans `poc/opentui`, séparé de la TUI Ink principale.
- ✅ Commande dédiée ajoutée : `pnpm poc:opentui`.
- ✅ Données mockées uniquement : aucun provider réel, aucune clé API, aucune migration produit.
- ✅ Écran principal interactif : éditeur multiline, badges de contexte, pickers, scrollbox résultat, états vide/loading/streaming/succès/erreur/warning.
- ✅ Raccourcis Ctrl traités hors textarea : génération, profils, niveaux, provider, modèle, erreur, reset, copie mock, aide et focus.
- ✅ Typecheck dédié ajouté : `pnpm poc:opentui:typecheck`.
- ✅ Capture texte documentée dans `poc/opentui/docs/capture.md`.
- ✅ Viewports texte bornés : prompt/résultat ne peuvent plus pousser le layout hors écran.
- ✅ État erreur réversible : `Ctrl+E` affiche une erreur mock sans perdre le dernier résultat, puis revient au résultat.
- ⏸️ Migration réelle non démarrée : attente de validation visuelle du POC.

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
