# Plan d’implémentation — CLI open source de reprompting

## 1. Mission

Construire une première version complète et publiable d’un CLI open source permettant de transformer une demande brute en un prompt clair, fidèle et directement exploitable par une IA.

L’outil doit être particulièrement performant pour les demandes liées au développement logiciel, au frontend et au web design, tout en restant utilisable pour des demandes textuelles générales.

La boucle principale du produit est :

```text
Écrire → améliorer → vérifier → copier → envoyer
```

L’outil ne doit pas devenir un chatbot, un agent de code ou un gestionnaire de conversations. Il intervient juste avant l’envoi du prompt vers Claude Code, Codex, OpenCode, ChatGPT ou un autre agent.

---

# 2. Contraintes générales

Le projet doit être :

* open source ;
* local-first ;
* multi-provider ;
* utilisable sur macOS, Linux et Windows ;
* rapide à lancer ;
* peu coûteux en tokens ;
* entièrement pilotable au clavier ;
* utilisable en mode commande simple ou dans une interface terminal ;
* extensible avec de nouveaux profils et providers ;
* sans serveur intermédiaire propriétaire ;
* sans télémétrie par défaut ;
* sans stockage des prompts par défaut.

Le développement doit être réalisé entièrement dans cette intervention, sans s’arrêter après la présentation du plan.

Ne publie rien sur npm ou GitHub sans autorisation explicite. Prépare néanmoins le projet pour qu’il soit publiable.

---

# 3. Nom de la commande

## Commande principale

Utiliser :

```bash
rp
```

Conserver également une commande longue :

```bash
reprompt
```

Les deux commandes doivent appeler exactement le même programme.

Dans `package.json`, exposer deux exécutables :

```json
{
  "bin": {
    "rp": "./dist/cli.js",
    "reprompt": "./dist/cli.js"
  }
}
```

Le nom du package npm pourra être différent du nom de l’exécutable. Vérifier la disponibilité du nom avant toute publication.

## Alias personnalisable

L’utilisateur doit pouvoir créer une commande encore différente :

```bash
rp alias set p
rp alias set ask
rp alias set prompt
```

Commandes nécessaires :

```bash
rp alias set <nom>
rp alias remove <nom>
rp alias list
```

Le système doit :

* détecter Bash, Zsh, Fish ou PowerShell ;
* afficher la modification prévue ;
* demander confirmation avant de modifier un fichier de profil shell ;
* délimiter clairement le bloc ajouté par le programme ;
* ne jamais supprimer de contenu extérieur au bloc géré ;
* proposer un mode `--dry-run` ;
* refuser les alias invalides ou dangereux ;
* avertir lorsqu’une commande portant déjà ce nom existe.

Exemple de bloc géré :

```bash
# >>> rp aliases >>>
alias p="rp"
# <<< rp aliases <<<
```

L’utilisateur doit également pouvoir créer manuellement son alias sans utiliser cette fonctionnalité.

---

# 4. Stack technique recommandée

Utiliser :

* TypeScript strict ;
* Node.js 20 ou supérieur ;
* pnpm ;
* Commander pour le parsing des commandes ;
* Ink et React pour l’interface terminal ;
* Zod pour la validation des configurations et des réponses structurées ;
* Vitest pour les tests ;
* tsup pour produire les exécutables JavaScript ;
* ESLint et Prettier ;
* l’API native `fetch` de Node pour limiter les dépendances.

Éviter de dépendre obligatoirement des SDK officiels des providers. Créer une abstraction légère autour de leurs API HTTP afin de :

* réduire la taille du package ;
* uniformiser les erreurs ;
* faciliter les endpoints compatibles OpenAI ;
* éviter de coupler le cœur du projet à un SDK particulier.

Utiliser les dernières versions stables compatibles entre elles au moment de l’implémentation.

---

# 5. Expérience utilisateur

## 5.1 Commande directe

```bash
rp "ajoute un bouton dans le dashboard pour exporter en pdf"
```

Par défaut, le CLI doit écrire uniquement le prompt amélioré dans `stdout`.

Cela permet notamment :

```bash
PROMPT=$(rp "corrige le formulaire sur mobile")
```

## 5.2 Mode interactif

La commande suivante ouvre la TUI :

```bash
rp
```

L’interface doit présenter :

1. la zone de saisie ;
2. le profil actif ;
3. le niveau de transformation ;
4. le provider ;
5. le modèle ;
6. le prompt reformulé ;
7. les actions disponibles.

Disposition indicative :

```text
┌──────────────────────────────────────────────────────────────┐
│ rp                                     Anthropic · Haiku     │
├──────────────────────────────────────────────────────────────┤
│ Prompt original                                              │
│ ──────────────────────────────────────────────────────────── │
│ ajoute une page settings mais touche pas à l'auth...         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Profil : Frontend             Niveau : Standard              │
├──────────────────────────────────────────────────────────────┤
│ Prompt amélioré                                             │
│ ──────────────────────────────────────────────────────────── │
│ Crée une page Settings en réutilisant...                     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Générer · Comparer · Copier · Réessayer · Quitter             │
└──────────────────────────────────────────────────────────────┘
```

## 5.3 Entrée standard

Supporter les pipes :

```bash
echo "corrige ça sans changer autre chose" | rp
```

```bash
cat demande.txt | rp
```

## 5.4 Presse-papiers

Supporter :

```bash
rp --clipboard
rp --clipboard --copy
rp "ma demande" --copy
```

Comportement :

* `--clipboard` lit le presse-papiers ;
* `--copy` copie le résultat ;
* le fonctionnement doit être multiplateforme ;
* utiliser une bibliothèque fiable ou des commandes natives avec gestion des erreurs ;
* ne jamais effacer le presse-papiers en cas d’échec.

## 5.5 Fichiers

Supporter :

```bash
rp --file demande.md
rp --file demande.md --profile frontend
```

Ne jamais modifier le fichier source.

## 5.6 Sortie structurée

Supporter :

```bash
rp "ma demande" --json
```

Format :

```json
{
  "original": "ma demande",
  "rewritten": "Ma demande reformulée",
  "profile": "code",
  "level": "standard",
  "provider": "anthropic",
  "model": "claude-haiku-4-5",
  "changes": [
    "Correction de la formulation",
    "Clarification de l’action attendue"
  ],
  "warnings": []
}
```

---

# 6. Commandes attendues

Implémenter au minimum :

```bash
rp
rp "<texte>"
rp --clipboard
rp --file <chemin>
rp profiles
rp models
rp providers
rp config
rp config get
rp config set <clé> <valeur>
rp config path
rp alias set <nom>
rp alias remove <nom>
rp alias list
rp doctor
rp version
```

Options globales :

```bash
--profile <profil>
--level <niveau>
--provider <provider>
--model <modèle>
--copy
--json
--diff
--explain
--no-stream
--timeout <millisecondes>
--verbose
--help
--version
```

Ajouter des raccourcis cohérents uniquement lorsqu’ils ne créent pas d’ambiguïté.

---

# 7. Profils de reformulation

Les profils doivent être indépendants, testables et faciles à étendre.

Structure attendue :

```ts
export interface PromptProfile {
  id: string;
  name: string;
  description: string;
  detect?: (input: string) => number;
  instructions: string;
  defaultLevel: RepromptLevel;
}
```

## 7.1 `auto`

Détecte localement le profil le plus pertinent avant l’appel au modèle.

La détection doit éviter un appel supplémentaire à l’IA.

Elle peut s’appuyer sur :

* les extensions de fichiers ;
* les chemins ;
* les commandes shell ;
* les technologies mentionnées ;
* les termes liés à l’interface ;
* les termes liés au design ;
* la présence de blocs de code ;
* la longueur et la structure du texte.

La détection doit retourner un score par profil.

En cas d’incertitude, utiliser `clean`.

Afficher le profil détecté en mode interactif. En mode non interactif, ne pas ajouter de bruit dans `stdout`.

## 7.2 `clean`

Objectif :

* corriger l’orthographe ;
* corriger la grammaire ;
* clarifier les formulations ambiguës ;
* conserver la structure originale autant que possible ;
* ne pas enrichir inutilement ;
* ne pas inventer d’informations.

## 7.3 `code`

Destiné aux agents de développement.

Le profil doit :

* conserver strictement l’intention ;
* préserver les noms de fichiers ;
* préserver les commandes ;
* préserver les technologies ;
* préserver les noms de fonctions, variables et composants ;
* distinguer ce qui doit être analysé de ce qui doit être exécuté ;
* expliciter les contraintes déjà présentes ;
* éviter les modifications hors périmètre ;
* éviter de transformer une petite demande en cahier des charges ;
* faire apparaître les validations demandées ;
* ne jamais inventer une architecture ou une fonctionnalité.

## 7.4 `frontend`

Destiné aux demandes d’implémentation frontend.

Il doit préserver les règles du profil `code` et mieux structurer les éléments suivants lorsqu’ils sont présents :

* framework utilisé ;
* composants concernés ;
* design system existant ;
* comportement attendu ;
* responsive ;
* états de chargement ;
* états vides ;
* états d’erreur ;
* accessibilité ;
* interactions ;
* animations ;
* contraintes mobiles et desktop ;
* critères de validation visuelle ;
* tests existants.

Le profil ne doit pas inventer de nouveaux états ou composants. Il doit seulement rendre explicites ceux contenus dans la demande ou indispensables à sa bonne interprétation.

Exemple :

```bash
rp --profile frontend "améliore la card et fait qu'elle marche mobile"
```

## 7.5 `web-design`

Destiné à la conception visuelle, aux landing pages et aux interfaces.

Il doit organiser les informations autour de :

* objectif de la page ;
* cible ;
* hiérarchie visuelle ;
* direction artistique ;
* sections ;
* typographie ;
* palette ;
* contraste ;
* rythme ;
* responsive ;
* réutilisation du design system ;
* assets fournis ;
* références fournies ;
* éléments qui ne doivent pas être modifiés.

Il doit éviter les formulations vagues comme « rends ça moderne » lorsque la demande contient des indications plus concrètes.

Il ne doit pas inventer de marque, de cible, de contenu commercial ou de direction artistique absente du prompt.

Le nom interne doit être `web-design`, mais accepter également l’alias :

```bash
rp --profile web-designer
```

## 7.6 `debug`

Destiné aux bugs.

Il doit structurer :

* comportement observé ;
* comportement attendu ;
* contexte ;
* reproduction ;
* messages d’erreur ;
* fichiers ou fonctionnalités concernés ;
* contraintes ;
* analyse demandée ;
* correction demandée ;
* tests de non-régression.

Il ne doit pas inventer une cause.

## 7.7 `review`

Destiné aux audits et revues de code.

Il doit distinguer :

* analyse ;
* risques ;
* problèmes confirmés ;
* hypothèses ;
* recommandations ;
* corrections autorisées ou non ;
* niveau de priorité ;
* preuves attendues.

## 7.8 `writing`

Destiné aux demandes textuelles non techniques :

* e-mails ;
* messages ;
* descriptions ;
* documents ;
* publications ;
* reformulations générales.

Il doit préserver le ton et l’objectif initial.

## 7.9 Profils personnalisés

Préparer l’architecture pour des profils utilisateur stockés dans :

```text
~/.config/rp/profiles/
```

Format Markdown avec frontmatter ou JSON validé par Zod.

Exemple :

```md
---
id: kubora
name: Kubora
extends: frontend
defaultLevel: standard
---

Conserve les composants existants et respecte le design system Kubora.
```

Cette fonctionnalité peut rester simple dans la V1, mais l’architecture ne doit pas l’empêcher.

---

# 8. Niveaux de transformation

Implémenter trois niveaux.

## `minimal`

* corriger les fautes ;
* améliorer légèrement la syntaxe ;
* conserver la structure ;
* ne presque rien ajouter.

## `standard`

Niveau par défaut.

* corriger ;
* clarifier ;
* structurer ;
* réduire les ambiguïtés ;
* préserver la taille réelle de la demande ;
* rendre les contraintes visibles.

## `complete`

* produire un brief plus rigoureux ;
* séparer objectif, contexte, actions, contraintes et validations ;
* ne compléter que ce qui est déjà présent ;
* signaler les informations réellement manquantes ;
* ne jamais inventer de décision.

Commandes :

```bash
rp --level minimal
rp --level standard
rp --level complete
```

---

# 9. Règles communes imposées à tous les modèles

Chaque profil doit hériter d’un socle commun.

Le modèle doit recevoir les règles suivantes :

1. Conserver strictement l’intention de l’utilisateur.
2. Corriger l’orthographe, la grammaire et les formulations ambiguës.
3. Conserver les noms techniques, commandes, chemins, technologies et identifiants.
4. Ne jamais inventer de fonctionnalité, contrainte, fichier ou décision.
5. Ne pas élargir artificiellement le périmètre.
6. Ne pas transformer une demande courte en cahier des charges disproportionné.
7. Distinguer clairement analyse et exécution lorsque cela est pertinent.
8. Conserver la langue de la demande.
9. Préserver les blocs de code sans les corriger, sauf demande explicite.
10. Ne pas répondre à la demande : uniquement la reformuler.
11. Ne pas ajouter de préambule conversationnel.
12. Ne pas inclure « voici votre prompt ».
13. Ne pas utiliser de Markdown inutile.
14. Signaler les ambiguïtés critiques sans bloquer toute la reformulation.
15. Produire une sortie directement copiable.

---

# 10. Format interne du résultat

Le moteur doit manipuler une structure stable :

```ts
export type RepromptLevel = "minimal" | "standard" | "complete";

export interface RepromptRequest {
  input: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  language?: string;
  includeChanges: boolean;
}

export interface RepromptResult {
  original: string;
  rewritten: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  changes: string[];
  warnings: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
    currency?: string;
  };
  latencyMs?: number;
}
```

Lorsque le provider supporte les sorties structurées, les utiliser.

Sinon :

* demander un JSON strict ;
* parser prudemment la réponse ;
* retirer les éventuelles fences Markdown ;
* valider avec Zod ;
* prévoir une stratégie de réparation locale limitée ;
* ne pas effectuer automatiquement un second appel coûteux sauf demande explicite.

---

# 11. Providers

## Architecture

Créer une interface commune :

```ts
export interface ProviderAdapter {
  id: string;
  name: string;
  listModels?(): Promise<ModelInfo[]>;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  validateConfiguration(): Promise<ProviderHealth>;
}
```

## Providers V1

Implémenter :

* OpenAI ;
* Anthropic ;
* DeepSeek ;
* Mistral ;
* OpenAI Compatible ;
* endpoint local compatible OpenAI.

## Adaptateur OpenAI Compatible

Cet adaptateur doit accepter :

```text
baseUrl
apiKey
model
customHeaders
```

Il permettra de brancher :

* des services tiers compatibles OpenAI ;
* des gateways ;
* Ollama lorsque son endpoint compatible est utilisé ;
* LM Studio ;
* vLLM ;
* d’autres providers futurs.

Ne pas coder une liste fermée empêchant l’utilisation d’un identifiant de modèle inconnu.

---

# 12. Modèles recommandés

Les recommandations doivent être présentées comme des presets modifiables, et non comme une vérité permanente.

Ajouter une date à la registry embarquée :

```ts
export const MODEL_PRESETS_UPDATED_AT = "2026-07-28";
```

## Preset recommandé par provider

### Anthropic

Modèle quotidien recommandé :

```text
claude-haiku-4-5
```

Anthropic le présente comme son modèle le plus rapide, avec une intelligence proche des modèles de pointe. Son positionnement correspond bien à une tâche courte, fréquente et structurée comme le reprompting.

Alternative de meilleure qualité :

```text
claude-sonnet-5
```

À réserver au niveau `complete`, aux demandes complexes ou aux reformulations où la fidélité est plus difficile à garantir. Anthropic le présente comme son meilleur compromis entre vitesse et intelligence.

### OpenAI

Modèle quotidien recommandé :

```text
gpt-5.4-mini
```

Configurer :

```text
reasoning.effort = none
```

OpenAI présente GPT-5.4 mini comme un modèle rapide et efficace pour les charges importantes, avec un positionnement particulièrement adapté au code et aux sous-agents.

Alternative économique à tester :

```text
gpt-5.4-nano
```

Ne pas en faire le modèle global par défaut avant d’avoir validé sa fidélité sur le benchmark du projet.

Alternative plus qualitative :

```text
gpt-5.6-terra
```

À proposer comme preset supérieur, mais pas comme choix quotidien par défaut en raison de son coût plus élevé. La documentation OpenAI le positionne comme le compromis entre intelligence et coût dans la famille GPT-5.6.

### DeepSeek

Modèle quotidien économique recommandé :

```text
deepseek-v4-flash
```

Utiliser le mode non-thinking par défaut pour le reprompting.

DeepSeek V4 Flash prend en charge les modes thinking et non-thinking, les API compatibles OpenAI et Anthropic, ainsi qu’un contexte allant jusqu’à un million de tokens. Les anciens alias `deepseek-chat` et `deepseek-reasoner` ont été retirés le 24 juillet 2026 et ne doivent pas être utilisés dans la configuration initiale.

Alternative de qualité :

```text
deepseek-v4-pro
```

### Mistral

Modèle recommandé :

```text
mistral-small-2603
```

Mistral Small 4 combine instruction, raisonnement et génération de code dans un modèle efficace. Son API prend en charge les sorties structurées et son positionnement convient aux reformulations rapides et fréquentes.

## Presets transversaux

Présenter ces choix dans le CLI :

```text
Budget          DeepSeek V4 Flash, non-thinking
Rapide          Claude Haiku 4.5
OpenAI          GPT-5.4 mini, reasoning none
Européen        Mistral Small 4
Qualité         Claude Sonnet 5
Personnalisé    Modèle et endpoint libres
```

Ne pas sélectionner automatiquement un provider selon son prix sans consentement de l’utilisateur.

## Premier démarrage

Lors de l’initialisation, afficher un choix simple :

```text
Quel équilibre souhaitez-vous ?

1. Recommandé — Claude Haiku 4.5
2. Économique — DeepSeek V4 Flash
3. OpenAI — GPT-5.4 mini
4. Européen — Mistral Small 4
5. Configuration personnalisée
```

Le choix doit rester modifiable ensuite.

---

# 13. Benchmark interne de reprompting

Ne pas choisir définitivement le meilleur modèle uniquement à partir du marketing des providers.

Créer un petit système d’évaluation reproductible.

## Dataset

Ajouter au moins 40 exemples anonymisés répartis entre :

* demandes de code mal formulées ;
* frontend ;
* web design ;
* bugs ;
* audits ;
* rédaction générale ;
* prompts très courts ;
* prompts longs ;
* fautes importantes ;
* mélange français/anglais technique ;
* blocs de code ;
* commandes et chemins devant être préservés.

Chaque cas doit contenir :

```ts
{
  id: string;
  input: string;
  profile: string;
  requiredTerms: string[];
  forbiddenAdditions?: string[];
  expectedIntent: string;
}
```

## Critères

Mesurer :

* conservation de l’intention ;
* conservation des termes techniques ;
* absence d’invention ;
* clarté ;
* concision ;
* respect du profil ;
* validité du JSON ;
* latence ;
* tokens d’entrée ;
* tokens de sortie ;
* coût estimé.

## Commande

```bash
pnpm benchmark
```

Ou :

```bash
rp eval --provider anthropic --model claude-haiku-4-5
```

Le benchmark ne doit jamais être lancé automatiquement, car il consomme du crédit API.

Ajouter une documentation expliquant que les résultats peuvent évoluer avec les modèles.

---

# 14. Configuration

Respecter XDG lorsque possible.

Emplacements indicatifs :

```text
Linux:   ~/.config/rp/config.json
macOS:   ~/Library/Application Support/rp/config.json
Windows: %APPDATA%\rp\config.json
```

Configuration :

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-haiku-4-5",
  "defaultProfile": "auto",
  "defaultLevel": "standard",
  "copyAfterGeneration": false,
  "stream": true,
  "timeoutMs": 30000,
  "showChanges": false,
  "telemetry": false
}
```

Valider toute la configuration avec Zod.

Les paramètres passés dans la commande doivent toujours avoir priorité sur la configuration globale.

Ordre de priorité :

```text
arguments CLI
variables d’environnement
configuration locale
valeurs par défaut
```

---

# 15. Gestion des clés API

Supporter :

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
DEEPSEEK_API_KEY
MISTRAL_API_KEY
RP_API_KEY
```

Règles :

* ne jamais écrire une clé dans les logs ;
* ne jamais afficher une clé complète ;
* ne jamais enregistrer une clé en clair dans `config.json` ;
* privilégier les variables d’environnement ;
* expliquer comment les définir ;
* prévoir une abstraction future pour le trousseau système ;
* ne pas imposer une dépendance native fragile dans la V1 ;
* `rp doctor` doit uniquement indiquer si une clé est présente, jamais sa valeur.

Exemple :

```text
Anthropic : configuré
OpenAI    : non configuré
DeepSeek  : configuré
Mistral   : non configuré
```

---

# 16. Protection des données sensibles

Avant l’envoi, détecter localement les motifs évidents :

* clés API ;
* tokens GitHub ;
* clés privées ;
* secrets AWS ;
* variables nommées `SECRET`, `TOKEN`, `PASSWORD` ou `API_KEY`.

En cas de détection :

```text
Un secret potentiel a été détecté dans le texte.
Continuer, masquer automatiquement ou annuler ?
```

En mode non interactif :

* interrompre avec un code de sortie explicite ;
* permettre `--force` ;
* permettre `--redact-secrets`.

Ne jamais conserver le texte analysé.

---

# 17. Diff et explication

Supporter :

```bash
rp "ma demande" --diff
```

Le diff doit rendre visibles les changements sans polluer la sortie principale.

Supporter également :

```bash
rp "ma demande" --explain
```

L’explication doit être courte :

```text
Modifications :
- correction de la formulation ;
- clarification de l’action attendue ;
- conservation de la commande pnpm ;
- aucune fonctionnalité ajoutée.
```

Dans la TUI, permettre de basculer entre :

* résultat ;
* comparaison ;
* modifications ;
* texte original.

---

# 18. Architecture du dépôt

Structure recommandée :

```text
.
├── src/
│   ├── cli.tsx
│   ├── app.tsx
│   ├── commands/
│   │   ├── reprompt.ts
│   │   ├── config.ts
│   │   ├── profiles.ts
│   │   ├── providers.ts
│   │   ├── models.ts
│   │   ├── aliases.ts
│   │   ├── doctor.ts
│   │   └── eval.ts
│   ├── core/
│   │   ├── engine.ts
│   │   ├── types.ts
│   │   ├── result-parser.ts
│   │   ├── prompt-builder.ts
│   │   ├── profile-detector.ts
│   │   └── secret-detector.ts
│   ├── profiles/
│   │   ├── base.ts
│   │   ├── auto.ts
│   │   ├── clean.ts
│   │   ├── code.ts
│   │   ├── frontend.ts
│   │   ├── web-design.ts
│   │   ├── debug.ts
│   │   ├── review.ts
│   │   ├── writing.ts
│   │   └── registry.ts
│   ├── providers/
│   │   ├── types.ts
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── openai-compatible.ts
│   │   ├── deepseek.ts
│   │   ├── mistral.ts
│   │   └── registry.ts
│   ├── models/
│   │   ├── presets.ts
│   │   └── model-resolver.ts
│   ├── config/
│   │   ├── schema.ts
│   │   ├── loader.ts
│   │   └── paths.ts
│   ├── aliases/
│   │   ├── manager.ts
│   │   └── shells/
│   ├── clipboard/
│   │   └── clipboard.ts
│   ├── ui/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── shortcuts.ts
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── benchmark/
│   ├── cases/
│   ├── runner.ts
│   └── scoring.ts
├── docs/
│   ├── configuration.md
│   ├── providers.md
│   ├── profiles.md
│   ├── privacy.md
│   └── development.md
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
└── package.json
```

---

# 19. Gestion des erreurs

Prévoir des messages compréhensibles pour :

* clé absente ;
* provider inaccessible ;
* modèle invalide ;
* timeout ;
* quota dépassé ;
* erreur de parsing ;
* JSON non valide ;
* presse-papiers inaccessible ;
* fichier introuvable ;
* configuration corrompue ;
* shell non reconnu ;
* alias déjà utilisé ;
* réponse vide.

Ne jamais afficher une stack complète par défaut.

Afficher les détails techniques avec :

```bash
rp --verbose
```

Codes de sortie :

```text
0  succès
1  erreur générale
2  configuration invalide
3  authentification
4  provider ou réseau
5  parsing de la réponse
6  secret détecté
7  entrée invalide
```

---

# 20. Performance et consommation

Optimiser l’usage quotidien :

* un seul appel modèle par reformulation ;
* pas d’appel IA pour choisir le profil ;
* pas de raisonnement activé par défaut ;
* réponse courte ;
* streaming lorsque le provider le permet ;
* température faible ;
* plafond de sortie adapté ;
* aucun historique injecté ;
* prompts système compacts mais explicites ;
* cache local uniquement pour la configuration, jamais pour les prompts.

Paramètres indicatifs :

```text
temperature: 0.1 à 0.3
maxOutputTokens: 1 500
reasoning: none ou désactivé
```

Permettre aux adapters d’ignorer les paramètres non supportés.

---

# 21. Raccourcis de la TUI

Prévoir au minimum :

```text
Ctrl+Enter  générer
Ctrl+Shift+C copier le résultat
Tab         changer de zone
Shift+Tab   revenir à la zone précédente
Ctrl+D      afficher le diff
Ctrl+P      changer de profil
Ctrl+M      changer de modèle
Ctrl+L      changer de niveau
Ctrl+R      régénérer
Esc         revenir ou fermer une fenêtre
Ctrl+C      quitter
```

Adapter les raccourcis lorsque le terminal intercepte certaines combinaisons.

Afficher une aide intégrée avec `?`.

---

# 22. Tests

## Tests unitaires

Tester :

* détection des profils ;
* construction des prompts système ;
* validation Zod ;
* parsing des réponses ;
* suppression des fences ;
* détection des secrets ;
* priorité des configurations ;
* résolution des modèles ;
* génération des alias ;
* préservation des blocs shell ;
* format JSON.

## Tests d’intégration

Mocker les appels HTTP pour chaque provider.

Vérifier :

* payload envoyé ;
* headers ;
* modèles ;
* parsing ;
* erreurs ;
* timeout ;
* streaming ;
* compatibilité OpenAI.

## Tests E2E

Tester les commandes réelles :

```bash
rp --help
rp --version
rp profiles
rp config path
echo "test" | rp --provider mock
rp "test" --json
```

Créer un provider `mock` disponible uniquement dans les tests afin de ne pas consommer de crédits.

## Tests de régression des profils

Ajouter des snapshots des instructions de chaque profil.

Vérifier explicitement que les règles communes sont présentes dans tous les profils.

---

# 23. Qualité obligatoire

Après chaque lot, exécuter :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Aucun lot ne peut être considéré comme terminé si une de ces commandes échoue.

À la fin, exécuter également les tests E2E sur le build final.

Ne pas masquer une erreur avec :

* `any` injustifié ;
* `@ts-ignore` ;
* désactivation globale d’une règle ESLint ;
* test supprimé ;
* catch vide ;
* valeur codée en dur uniquement pour faire passer un test.

---

# 24. Lots d’implémentation

## Lot A — Initialisation

* initialiser le projet ;
* configurer TypeScript strict ;
* configurer pnpm, ESLint, Prettier, Vitest et tsup ;
* créer les commandes `rp` et `reprompt` ;
* ajouter la CI minimale ;
* créer la structure du dépôt.

## Lot B — Domaine et moteur

* créer les types ;
* créer le moteur de reformulation ;
* créer le système de profils ;
* créer les niveaux ;
* créer le builder de prompt ;
* créer le parsing structuré ;
* créer le provider mock.

## Lot C — Providers et modèles

* implémenter OpenAI ;
* implémenter Anthropic ;
* implémenter OpenAI Compatible ;
* implémenter DeepSeek ;
* implémenter Mistral ;
* ajouter les presets de modèles ;
* ajouter les erreurs uniformisées ;
* ajouter `rp providers` et `rp models`.

## Lot D — Profils

* implémenter `clean` ;
* implémenter `code` ;
* implémenter `frontend` ;
* implémenter `web-design` ;
* implémenter `debug` ;
* implémenter `review` ;
* implémenter `writing` ;
* implémenter `auto` avec détection locale ;
* ajouter les tests de non-invention et de préservation.

## Lot E — CLI non interactif

* saisie directe ;
* stdin ;
* fichier ;
* presse-papiers ;
* copie ;
* JSON ;
* diff ;
* explain ;
* profils, niveaux, providers et modèles ;
* codes de sortie ;
* gestion des erreurs.

## Lot F — Configuration

* chemins multiplateformes ;
* schéma Zod ;
* variables d’environnement ;
* commandes de configuration ;
* assistant de premier démarrage ;
* commande `doctor`.

## Lot G — TUI

* éditeur de prompt ;
* sélection du profil ;
* sélection du niveau ;
* sélection du provider et du modèle ;
* écran de génération ;
* résultat ;
* diff ;
* copie ;
* erreurs ;
* raccourcis ;
* responsive aux différentes tailles de terminal.

## Lot H — Alias shell

* détection du shell ;
* Bash ;
* Zsh ;
* Fish ;
* PowerShell ;
* création et suppression sécurisées ;
* dry-run ;
* détection des collisions ;
* tests sur fichiers temporaires.

## Lot I — Confidentialité et sécurité

* détection locale de secrets ;
* redaction optionnelle ;
* absence d’historique ;
* absence de télémétrie ;
* absence de clés dans les logs ;
* documentation confidentialité ;
* fichier `SECURITY.md`.

## Lot J — Benchmark et documentation

* dataset d’évaluation ;
* runner ;
* rapport JSON et Markdown ;
* README ;
* documentation des providers ;
* documentation des profils ;
* exemples ;
* guide de contribution ;
* licence MIT ;
* changelog initial.

## Lot K — Stabilisation

* exécuter tous les tests ;
* tester macOS, Linux et Windows en CI ;
* corriger les erreurs ;
* vérifier l’installation globale ;
* tester les deux exécutables ;
* vérifier le package npm avec `pnpm pack` ;
* installer l’archive produite dans un dossier temporaire ;
* tester le binaire réellement packagé.

Effectuer un commit propre à la fin de chaque lot.

---

# 25. CI GitHub

Créer une GitHub Action exécutée sur :

* Ubuntu ;
* macOS ;
* Windows.

Tester au minimum les versions LTS maintenues de Node.

Commandes CI :

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
pnpm pack
```

Ne jamais lancer les benchmarks payants dans la CI publique.

---

# 26. README

Le README doit immédiatement montrer :

```bash
pnpm install -g <nom-du-package>
```

Puis :

```bash
rp
```

Et :

```bash
rp "ajoute un bouton pour exporter le rapport"
```

Présenter ensuite :

* la promesse ;
* une capture ou démonstration terminal ;
* les profils ;
* les providers ;
* la configuration ;
* les clés API ;
* la confidentialité ;
* les modèles recommandés ;
* les aliases ;
* les commandes ;
* les contributions.

Le README principal doit être rédigé en anglais pour un projet public.

Ajouter une documentation française dans :

```text
docs/fr/
```

---

# 27. Critères d’acceptation

La V1 est terminée lorsque :

1. `rp` et `reprompt` fonctionnent.
2. `rp` sans argument ouvre la TUI.
3. `rp "texte"` retourne une reformulation.
4. Les pipes fonctionnent.
5. Le presse-papiers fonctionne.
6. Les profils `auto`, `clean`, `code`, `frontend`, `web-design`, `debug`, `review` et `writing` fonctionnent.
7. Les trois niveaux fonctionnent.
8. OpenAI, Anthropic, DeepSeek, Mistral et OpenAI Compatible fonctionnent.
9. L’utilisateur peut fournir n’importe quel identifiant de modèle.
10. L’utilisateur peut changer son provider et son modèle par défaut.
11. L’utilisateur peut créer un alias shell depuis le CLI.
12. Le diff et la copie fonctionnent.
13. Les clés API ne sont jamais enregistrées en clair.
14. Aucun prompt n’est conservé.
15. Les secrets potentiels sont détectés.
16. Le benchmark peut comparer plusieurs modèles.
17. Le projet passe sur macOS, Linux et Windows.
18. Les commandes suivantes réussissent :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

19. `pnpm pack` produit un package installable.
20. Le README permet à un nouvel utilisateur d’installer et d’utiliser le projet sans connaître son architecture.

---

# 28. Résultat attendu de l’intervention

À la fin, fournir :

* le résumé de ce qui a été construit ;
* l’arborescence finale ;
* les choix techniques importants ;
* les modèles configurés ;
* les profils disponibles ;
* les commandes utilisateur ;
* les résultats exacts des tests ;
* les éventuelles limites restantes ;
* les commits créés ;
* les étapes nécessaires pour publier sur GitHub et npm.

Ne pas déclarer une fonctionnalité terminée sans preuve.

Ne pas publier le package et ne pas créer de dépôt distant sans autorisation explicite.
