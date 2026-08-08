# Registre de capacités — garder les surfaces synchronisées

Ce document précède l'implémentation desktop. Il concerne les trois surfaces et
doit être réalisé avant elles.

---

# 1. Le problème

Reqraft expose aujourd'hui les mêmes fonctionnalités par trois chemins
indépendants :

| Surface | Où sont déclarées les actions |
|---|---|
| CLI | les options de `commands/reprompt.ts` et les commandes de `cli.tsx` |
| TUI | `getCommandOptions()` dans `ui/modal-options.ts` |
| Desktop | à venir, dans la capsule et le popover |

Rien n'oblige une nouvelle fonctionnalité à apparaître partout. Ajouter un flag
CLI ne provoque aucune erreur de compilation ailleurs. La dérive est silencieuse
et ne se voit qu'à l'usage, souvent des semaines plus tard.

Avec une quatrième surface, le coût de chaque oubli triple.

---

# 2. Le principe

Une seule déclaration de ce que le produit sait faire. Chaque surface la
consomme et la rend à sa manière. Un test échoue si une surface en omet une.

```text
capabilities/registry.ts
  ├─ CLI      : options et aide
  ├─ TUI      : palette ⌃K
  └─ Desktop  : actions de la capsule et du popover
```

Ce n'est pas une abstraction gratuite : `getCommandOptions()` fait déjà
exactement ça pour une surface. Il s'agit de le remonter d'un cran.

---

# 3. Forme attendue

```ts
export type Surface = "cli" | "tui" | "desktop";

export interface Capability {
  /** Identifiant stable, jamais traduit, jamais renommé. */
  id: string;
  /** Libellé utilisateur, en français. */
  label: string;
  /** Une phrase, affichée en aide et en description. */
  description: string;
  /** Surfaces sur lesquelles la capacité doit apparaître. */
  surfaces: Surface[];
  /** N'a de sens qu'une fois un résultat produit. */
  requiresResult?: boolean;
  /** Option de ligne de commande, quand la surface CLI est concernée. */
  cliFlag?: string;
}
```

Un `id` n'est jamais renommé : il sert de clé entre les surfaces et dans les
tests. Le `label` peut changer librement.

---

# 4. Capacités à recenser

Établies à partir du code existant, pas d'une intention.

| id | Surfaces | Note |
|---|---|---|
| `reformulate` | cli, tui, desktop | l'action centrale |
| `select-profile` | cli, tui, desktop | `--profile` |
| `select-level` | cli, tui, desktop | `--level` |
| `select-provider` | cli, tui, desktop | `--provider` |
| `select-model` | cli, tui, desktop | `--model` |
| `show-diff` | cli, tui, desktop | `--diff`, exige un résultat |
| `show-explain` | cli, tui, desktop | `--explain`, exige un résultat |
| `copy-result` | cli, tui, desktop | `--copy`, exige un résultat |
| `show-stats` | cli, tui, desktop | `--stats` |
| `redact-secrets` | cli, desktop | `--redact-secrets` |
| `fail-on-quality` | cli | propre à l'usage scripté |
| `json-output` | cli | propre à l'usage scripté |
| `replace-in-place` | desktop | propre au desktop |
| `interrupt` | tui, desktop | pas de sens en non interactif |

Deux enseignements que ce tableau rend visibles :

`redact-secrets` existe au CLI et **manque à la TUI**. La détection de secrets
tourne dans les deux, mais l'option de masquage n'est offerte qu'en ligne de
commande. C'est exactement la dérive que le registre doit empêcher, et elle est
déjà là.

Toutes les capacités ne vont pas partout, et c'est légitime : `json-output` n'a
pas de sens dans une capsule. Le champ `surfaces` porte cette intention, au lieu
de la laisser implicite.

---

# 5. Le test qui tient la promesse

Sans lui, le registre n'est qu'un commentaire.

```
Pour chaque capacité du registre :
  pour chaque surface qu'elle déclare :
    la liste exposée par cette surface contient son id
```

Chaque surface expose donc une fonction d'inventaire :

- `listCliCapabilities()` — dérivée des options réellement déclarées à Commander
- `listTuiCapabilities()` — dérivée de `getCommandOptions()`
- `listDesktopCapabilities()` — dérivée des actions de la capsule et du popover

Le test doit lire **la déclaration réelle** de chaque surface, pas une seconde
liste écrite à la main. Une liste recopiée ne prouve rien : elle dérive avec le
reste.

Un test symétrique complète le premier : toute capacité exposée par une surface
mais absente du registre est un échec. Sinon on peut contourner le contrôle en
ajoutant discrètement une action hors registre.

---

# 6. Lot

Un seul, avant le desktop.

- Créer `src/capabilities/registry.ts` avec les entrées du tableau.
- Faire dériver `getCommandOptions()` du registre plutôt que de sa liste en dur.
- Faire dériver l'aide CLI des entrées portant un `cliFlag`.
- Ajouter les deux tests de la section 5.
- Corriger l'écart trouvé : exposer `redact-secrets` dans la TUI, ou retirer
  `tui` de ses surfaces avec la raison écrite.

**Sortie :** ajouter une entrée au registre fait échouer les tests des surfaces
qui ne l'exposent pas encore. C'est le seul critère qui compte.

---

# 7. Limite assumée

Le registre garantit qu'une capacité est **exposée** partout où elle le doit. Il
ne garantit pas qu'elle se **comporte** pareil partout — ça reste du ressort des
tests de chaque surface.

C'est suffisant : l'oubli d'exposition est le mode de dérive réel, le
comportement divergent est rare parce que tout passe par `application/`.
