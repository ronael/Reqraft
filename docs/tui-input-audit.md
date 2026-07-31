# Audit de l’éditeur TUI actuel

Date : 2025-07-30
Portée : composant `PromptField` + `TextInput` personnalisé dans Reqraft.

## Architecture actuelle

`PromptField` simule un éditeur multiligne en découpant le `value` du prompt sur
`\n` :

- toutes les lignes sauf la dernière sont affichées en `Text` statique ;
- la dernière ligne est confiée à un `TextInput` monoligne qui modifie
  uniquement cette dernière ligne ;
- quand l’utilisateur appuie sur Entrée, `resolveSubmit` décide soit d’ajouter
  un `\n` (continuation avec `\` final), soit de lancer la génération.

Cette approche est volontairement minimalistme : elle repose sur le fait que le
prompt Reqraft reste un texte relativement court, même en mode multiligne.

## Gestion du curseur

Responsable : `TextInput` personnalisé.

- Un état local `cursorOffset` suit la position dans la dernière ligne.
- `useEffect` réduit `cursorOffset` si la valeur raccourcit (p. ex. suppression).
- Mouvements :
  - ← / → : déplacement caractère par caractère ;
  - pas de Home / End gérés actuellement ;
  - pas de saut à une ligne précédente/suivante.

**Zones fragiles**

- Si un caractère est inséré au milieu de la dernière ligne, le curseur avance
  de la longueur insérée. OK pour ASCII, correct pour une chaîne collée.
- Pas de gestion de la souris : pas d’API ink-text-input pour cliquer.
- Le curseur visuel est simulé par `chalk.inverse` sur le caractère actif ;
  quand il est en fin de ligne, un espace inverse est affiché. C’est cohérent
  mais limité quand le texte dépasse la largeur du terminal.

## Multiligne

- Les nouvelles lignes ne sont créées que via la continuation `\` + Entrée.
- Ce n’est pas un vrai éditeur multiligne : l’utilisateur ne peut pas remonter
  modifier une ligne déjà validée sans la réintégrer à la dernière ligne.
- Pas de flèche haut/bas dans le champ : ces touches sont réservées à
  l’application.

**Bugs potentiels**

- Collage d’un texte multiligne : seule la dernière ligne atterrit dans le
  `TextInput`, les lignes précédentes sont concaténées en une seule ligne par
  la fonction `handleChange` (`[...committed, next].join("\n")`) si le presse-
  papiers contient des `\n` au milieu du `input` envoyé à `onChange`. En
  pratique `ink` envoie un seul événement `input` avec tout le texte collé,
  donc la chaîne contiendra des `\n` et sera interprétée comme plusieurs
  lignes — ce qui semble OK, mais la position du curseur après collage sera
  positionnée à la fin du dernier caractère collé sans tenir compte de la
  rupture de ligne.

## Wrapping

- Le composant parent (`PromptField`) passe `wrap="wrap"` aux lignes committées
  et le `TextInput` utilise un simple `Text` sans largeur explicite.
- Aucune gestion du retour à la ligne logique : le curseur se fonde sur les
  caractères de la dernière ligne, pas sur les lignes affichées.

**Bugs potentiels**

- Quand la dernière ligne est plus longue que le terminal, le curseur inverse
  est rendu au caractère `cursorOffset` réel, mais l’affichage wrap peut le
  placer visuellement n’importe où. L’utilisateur perd la perception exacte du
  point d’insertion.

## Collage (paste)

- `useInput` reçoit tout le texte collé dans un seul `input` (documenté par
  Ink et observé dans `parse-keypress`).
- Notre `TextInput` insère `input` à `cursorOffset` si ce n’est pas une touche
  spéciale.

**Zones fragiles**

- Collage contenant des tabulations (`\t`) : affiché comme un caractère
  spécial probablement incorrect.
- Collage contenant `\r` : non normalisé ; `\r\n` créera des retours à la
  ligne parasites.
- Collage d’un texte long au milieu d’une ligne déjà longue : pas de
- protection contre la largeur du terminal, l’affichage déborde.

## Unicode

- `String.prototype` est utilisé pour `slice`, `length`, etc.
- JavaScript compte les unités de code UTF-16 ; les émojis et certains
  caractères composés peuvent être scindés en deux unités.
- `Array.from(value)` est utilisé côté rendu, ce qui améliore le découpage des
  caractères grapheme, mais le curseur avance de `input.length` (unités de
  code) après une insertion, pas de `Array.from(input).length`.

**Bug potentiel concret**
- Si l’utilisateur colle un émoji à une position interne, `cursorOffset`
  augmente de 2, et le curseur affiché peut se décaler par rapport à la
  position réelle.

## Touches Ctrl

- Ctrl+C est capturé au niveau application pour annuler/quitter.
- Ctrl+A/E (début/fin de ligne courante), Ctrl+W/Meta+Backspace (suppression
  mot), Ctrl+U (couper jusqu’au début) ne sont pas gérés ; ils insèrent la
  lettre correspondante (p. ex. `^A` invisible) ou restent silencieux.
- Ctrl+L efface l’écran dans certains terminaux si Ink ne capture pas le
  signal.
- Le fix du Lot A empêche Ctrl/Meta d’insérer les lettres. Les touches
  non-raccourcies deviennent des non-opérations.

## Home / End / flèches haut/bas

- Home/End ne sont pas capturées : elles génèrent typiquement `\x1b[H` /
  `\x1b[F`, interprétées comme des flèches par `parse-keypress`, donc Home
  devient équivalent à ↑ et End à ↓, sans effet visible dans le champ.
- Flèches haut/bas sont réservées à l’application (navigation overlay),
  pas au champ.
- Flèches gauche/droite fonctionnent sur la dernière ligne uniquement.

## Suppression

- Backspace et Delete sont gérés localement dans `TextInput` ; la logique
  retire le caractère avant le curseur et recule d’une position.
- Si le curseur est en début de ligne, Backspace ne supprime pas le `\n`
  précédent : la ligne précédente et la ligne courante ne sont pas fusionnées.
- Il n’y a pas de suppression vers l’avant quand le curseur est en début de
  ligne.

## Resize

- `useTerminalSize` écoute `resize` sur `stdout` et fournit `columns`/`rows`.
- L’éditeur ne recalcule pas le wrapping en conséquence ; seules les
  dimensions du `AppFrame` et des panneaux changent.

## Synthèse des risques

| Domaine        | Niveau | Problème principal                                                  |
|----------------|--------|----------------------------------------------------------------------|
| Curseur        | moyen  | Décalage possible sur Unicode / emojis, pas de retour ligne logique. |
| Multiligne     | élevé  | Lignes committées non éditables directement.                         |
| Wrapping       | moyen  | Curseur visuel peut ne pas coller à la position logique.             |
| Collage        | moyen  | Texte long ou multiligne mal maîtrisé, tabulations non gérées.       |
| Unicode        | moyen  | Comptage UTF-16 vs graphemes dans le curseur.                        |
| Ctrl           | moyen  | Manque raccourcis édition usuels (Ctrl+A/E/W/U/K).                   |
| Home/End       | faible | Non gérés, mappés sur flèches par Ink.                               |
| Flèches        | faible | Pas d’édition des lignes committées.                                 |
| Suppression    | moyen  | Pas de fusion de lignes, pas de suppression mot.                     |
| Resize         | faible | Pas de recalcul de wrapping.                                         |

## Recommandation technique

L’éditeur actuel est suffisant pour un prompt de quelques lignes, mais atteint
ses limites si Reqraft doit supporter :

- prompts longs (>20 lignes) ;
- édition fine (insertion au milieu, remontée dans le texte) ;
- collage de textes complexes.

Une solution robuste nécessiterait soit :

1. une librairie d’éditeur de texte comme `@opentui/core` ou un textarea
   avancé ;
2. soit un hook interne plus riche gérant les graphemes, le wrapping au pixel,
   et un modèle de buffer unifié.

Le Lot C évalue l’option (1).
