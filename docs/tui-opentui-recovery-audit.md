# Audit de reprise TUI OpenTUI

Date : 2026-07-30

## Décision

Stratégie recommandée : **B — refactorisation progressive avec remplacement du renderer principal**.

Il ne faut pas refaire Reqraft. Le moteur, les providers, les profils, la config,
la fidélité, les stats, la détection de secrets et les commandes non interactives
sont à conserver. En revanche, la couche TUI active reste une application Ink et
le prototype OpenTUI est mocké. La migration saine consiste donc à extraire un
contrôleur TUI partagé, puis à construire un renderer OpenTUI réel écran par
écran, en commençant par l’écran principal.

## État observé

### Produit actif

- `src/cli.tsx` lance `render(<App />, { exitOnCtrlC: false })` quand aucun texte
  non interactif n’est fourni.
- `src/app.tsx` est l’écran interactif actif. Il utilise Ink, pas OpenTUI.
- `src/application/reprompt.ts` connecte correctement la TUI au moteur réel
  `rewrite`, aux providers, à la config et au streaming via `onDelta`.
- Les commandes `doctor`, `profiles`, `models`, `providers` et `init` restent
  des surfaces console/readline, pas des écrans TUI.

### Travail OpenTUI ajouté

- `spikes/opentui/` est un projet séparé Bun avec `@opentui/core` et
  `@opentui/react`.
- Le spike utilise `<textarea>` et `<scrollbox>`, donc il prouve que les briques
  OpenTUI ciblées existent.
- Son contrôleur `spikes/opentui/src/controller.ts` est mocké :
  - providers, profils et modèles hardcodés ;
  - streaming simulé par `MOCK_STREAM_CHUNKS` ;
  - aucune connexion à `application/reprompt.ts` ;
  - aucune hydratation de config ou de credentials ;
  - copie simulée ;
  - warning explicite indiquant que le résultat est une simulation.
- La souris est activée, mais les clics sont mappés sur des coordonnées fixes
  de ligne/colonne. Ce n’est pas maintenable pour un layout responsive.

### Ancienne TUI Ink

La TUI Ink existe toujours et elle est celle utilisée par `pnpm dev`.
Elle a des éléments solides :

- modules purs testés : `app-state`, `app-actions`, `shortcuts`,
  `shortcut-intents`, `command-intents`, `modal-options`, `result-view`,
  `generation-state` ;
- streaming réel vers l’UI via `onDelta` ;
- parsing provider incrémental côté OpenAI-compatible et Anthropic ;
- erreurs provider transformées en messages UI structurés ;
- tests clavier avec `ink-testing-library`.

Ses limites pour l’objectif OpenTUI :

- pas de souris native ;
- pas de vrais overlays, les modales remplacent l’écran ;
- éditeur multiline simulé, dernière ligne uniquement éditable ;
- pas de scroll natif, seulement clipping ;
- focus et raccourcis gérés à la main ;
- état de génération partiellement local à `App` (`partialText`, `startedAt`,
  `isLoading`, `AbortController`) au lieu d’un contrôleur TUI explicite.

## Référence HTML

`docs/design/reqraft-cli-ui.html` contient les intentions suivantes :

- écran principal vide, rempli, loading, résultat ;
- vues diff et explication ;
- palette d’actions ;
- pickers profil, niveau, modèle ;
- aide ;
- init wizard ;
- doctor, config, profiles, models, providers, alias ;
- erreurs, confirmations, états vides et chargements.

La référence est utile pour la hiérarchie visuelle et les états, mais pas comme
code à traduire. Les cartes arrondies, ombres, grilles web et tailles fixes
doivent être adaptées au terminal.

## Matrice de reprise

| Élément                            | État actuel                              | Décision                                 | Priorité |
| ---------------------------------- | ---------------------------------------- | ---------------------------------------- | -------- |
| Moteur `application/reprompt.ts`   | Connecté au réel                         | Conserver                                | Haute    |
| Providers + streaming SSE          | Réels et testés                          | Conserver                                | Haute    |
| Modules purs `src/ui/*.ts`         | Réutilisables                            | Refactoriser vers contrôleur partagé     | Haute    |
| `src/app.tsx` Ink                  | Fonctionnel mais trop couplé au renderer | Refactoriser puis remplacer              | Haute    |
| Composants Ink                     | Utiles comme référence                   | Remplacer progressivement                | Moyenne  |
| `PromptField` / `TextInput`        | Rustine multiline                        | Remplacer par textarea OpenTUI           | Haute    |
| `SelectList`                       | Logique pure utile                       | Conserver la logique, remplacer le rendu | Moyenne  |
| `spikes/opentui/src/main.tsx`      | Prototype visuel                         | Conserver temporairement comme référence | Basse    |
| `spikes/opentui/src/controller.ts` | Mocké et dupliqué                        | Supprimer ou réécrire                    | Haute    |
| `docs/design/reqraft-cli-ui.html`  | Référence                                | Conserver comme brief visuel             | Basse    |
| `init` readline                    | Fonctionnel, hors TUI                    | Ne pas migrer avant écran principal      | Basse    |
| Commandes non interactives         | Contrat sain                             | Intangible                               | Haute    |

## Tests réels effectués

Commandes lancées hors sandbox, car `tsx` ne peut pas ouvrir son pipe IPC dans
la sandbox (`listen EPERM`).

```bash
pnpm dev "corrige cette phrase" --provider mock --stats
pnpm dev doctor
pnpm dev profiles
pnpm dev models
pnpm dev providers
pnpm dev init
pnpm dev
```

Résultats :

- CLI mock : succès, stdout contient uniquement `[mock] corrige cette phrase`,
  stats séparées.
- `doctor` : succès, providers réels vérifiés, `openai-compatible` signale
  `manque baseUrl`.
- `profiles`, `models`, `providers` : succès, rendu console propre.
- `init` : flux readline, annulation testée via choix `4`, aucune modification.
- TUI Ink :
  - saisie simple OK ;
  - `Ctrl+P` ouvre le picker profil sans écrire `p` ;
  - `Esc` revient à l’écran principal en conservant la saisie ;
  - tentative multiline en pseudo-TTY fragile : le retour envoyé apparaît comme
    caractère de contrôle dans la ligne, ce qui confirme que l’éditeur actuel
    n’est pas un vrai multiline robuste ;
  - fermeture `Ctrl+C` restaure le curseur terminal.

## Architecture cible

```text
moteur Reqraft
  -> contrôleur TUI partagé
  -> renderer OpenTUI
```

Le contrôleur doit posséder l’état interactif complet :

```ts
type TuiState = {
  input: string;
  result: string;
  status: "idle" | "loading" | "streaming" | "success" | "error";
  profile: string;
  level: string;
  provider: string;
  model: string;
  activeOverlay: string | null;
  focusedElement: string;
  warning?: string;
  error?: string;
};
```

Le renderer OpenTUI doit afficher cet état et déclencher des actions. Il ne doit
pas connaître les payloads provider, les règles de fidélité, les profils, la
config ou les credentials.

## Plan recommandé

### Lot A — Figer le contrôleur partagé

- Extraire de `src/app.tsx` les états locaux de génération.
- Créer une couche `src/tui/` ou `src/ui/controller/` indépendante d’Ink.
- Tester `input`, génération, deltas, annulation, erreurs, stats, overlays.

### Lot B — Intégrer OpenTUI sans remplacer le CLI

- Ajouter les dépendances OpenTUI dans le package principal.
- Créer une entrée expérimentale contrôlée, par exemple `rp tui --renderer opentui`
  ou un flag interne, sans casser `rp`.
- Initialiser et restaurer le terminal proprement.

### Lot C — Écran principal OpenTUI réel

- Header, textarea, contexte actif, résultat scrollable, stats, erreurs,
  warnings, aide minimale.
- Connexion au contrôleur partagé.
- Aucun mock.

### Lot D — Streaming et annulation

- Tester `{ type: "text-delta", text: "Bonjour" }`,
  `{ type: "text-delta", text: " le monde" }`, `completed`.
- Garantir que le renderer reçoit toujours du texte, jamais un objet brut.
- Annuler sans mutation tardive de l’interface.

### Lot E — Clavier et souris centralisés

- Dispatcher unique avec priorité overlay -> éditeur -> écran -> global.
- Clics sur badges basés sur zones déclarées par les composants, pas coordonnées
  fixes hardcodées.

### Lot F — Pickers et overlays

- Reprendre la logique pure existante des options.
- Rendre les overlays réellement superposés et scrollables.

### Lot G — Responsive et robustesse

- Tester 40x15, 80x24, 120x34.
- Collage long, Unicode, resize, scroll, fermeture après erreur.

### Lot H — Remplacement ou suppression Ink/spike

- Quand l’écran principal OpenTUI est validé, décider si Ink reste fallback ou
  si l’entrée interactive bascule.
- Supprimer le contrôleur mocké du spike.

## Limites restantes

- Aucun test souris automatisé n’a encore été exécuté.
- Le spike OpenTUI n’a pas été lancé dans ce lot.
- La compatibilité Windows d’OpenTUI reste à vérifier avant d’en faire le
  renderer par défaut.
- Les écrans secondaires HTML ne doivent pas être migrés avant validation de
  l’écran principal réel.
