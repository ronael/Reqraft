# Reqraft dans Codex et Claude Code

Tapez votre demande dans Codex, Claude Code ou un autre agent du terminal comme
elle vient, appuyez sur sa touche d'éditeur (**Ctrl+G** dans la plupart), et
Reqraft la réécrit sur place. Vous voyez l'avant et l'après :
Entrée garde la réécriture, `r` en relance une, Échap rend votre brouillon
intact.

## Comment ça marche

Codex, Claude Code et les agents listés plus bas savent confier le brouillon en
cours à un éditeur externe.
Ils l'écrivent dans un fichier, lancent le programme nommé par `VISUAL` (ou
`EDITOR`), attendent qu'il se termine, puis remettent le contenu du fichier
dans leur zone de saisie.

Reqraft joue cet éditeur. `rp edit <fichier>` lit le brouillon, le réécrit
avec votre fournisseur, votre profil et votre niveau habituels, et n'écrit le
résultat que si vous le gardez. Une réécriture annulée ou ratée laisse le
fichier tel quel : l'agent vous rend votre brouillon, sans message d'erreur.

Pour qu'un agent passe par `rp edit`, Reqraft ajoute une ligne par agent au
fichier de démarrage de votre shell. Cette ligne règle `VISUAL` pour cet agent
seulement : `git commit` et tous les autres outils gardent votre éditeur. Si
l'agent lance lui-même une commande qui ouvre un éditeur, comme `git commit`
sans `-m`, `rp edit` confie ce fichier à votre `EDITOR` sans y toucher : il ne
réécrit que les brouillons de l'agent, fichiers Markdown ou texte hors d'un
dossier `.git`.

```sh
# >>> reqraft agents >>>
codex() { VISUAL="rp edit" command codex "$@"; }
claude() { VISUAL="rp edit" command claude "$@"; }
# <<< reqraft agents <<<
```

Rien ne part vers votre fournisseur avant Ctrl+G, et seulement le brouillon,
comme pour n'importe quelle réécriture `rp`. La détection des secrets
s'applique de la même façon.

## Relire dans l'app

Quand l'app Reqraft est ouverte, Ctrl+G montre le brouillon dans la capsule
plutôt que dans le terminal : l'avant et l'après, le profil et le niveau, et un
résultat que vous pouvez retoucher. **Remplacer** le renvoie à l'agent et
ramène le terminal au premier plan ; fermer la capsule laisse votre brouillon
tel quel. App fermée, ou agent lancé en SSH, la relecture reste dans le
terminal.

Réglages › Agents IA › Relecture choisit entre les deux.

## L'activer

Il faut l'outil en ligne de commande, `rp`. Si vous n'avez que l'app desktop,
installez-le d'abord :

```sh
npm install -g @reqraft/cli
```

Choisissez ensuite la façon qui vous va.

- **Dans l'app desktop** : Réglages › Agents IA liste les agents trouvés sur
  votre ordinateur. **Activer** écrit la ligne ; **Copier la ligne** vous la
  laisse coller vous-même.
- **En ligne de commande** : `rp agents` montre la même liste et propose les
  mêmes choix. `rp init` pose la question à la fin de la configuration.
- **Laisser votre agent s'en charger** : **Copier pour votre agent** (dans
  l'app) ou le troisième choix de `rp agents` copie une courte consigne.
  Collez-la dans Codex ou Claude Code : l'agent installe `rp` s'il manque, puis
  lance `rp agents --enable --yes`.

Ouvrez ensuite un nouvel onglet de terminal : un shell ne lit son fichier de
démarrage qu'au lancement.

```sh
rp agents                 # liste les agents et propose quoi faire
rp agents --enable --yes  # active tous les agents installés, sans demander
rp agents --print         # affiche les lignes à coller soi-même
rp agents --prompt        # affiche la consigne pour votre agent
rp agents --disable       # retire les lignes de Reqraft
```

## Agents pris en charge

| Agent | Commande | Raccourci | Remarque |
|---|---|---|---|
| Codex (OpenAI) | `codex` | Ctrl+G | |
| Claude Code (Anthropic) | `claude` | Ctrl+G | aussi Ctrl+X Ctrl+E |
| Gemini CLI (Google) | `gemini` | Ctrl+G | version 0.38 ou plus ; un éditeur choisi avec `/editor` passe avant |
| GitHub Copilot CLI | `copilot` | Ctrl+G | |
| opencode | `opencode` | Ctrl+X E | aussi `/editor` |
| Kimi Code | `kimi` | Ctrl+G | un éditeur choisi avec `/editor` passe avant |
| pi | `pi` | Ctrl+G | le réglage `externalEditor` passe avant |
| Mistral Vibe | `vibe` | Ctrl+G | |
| Aider | `aider` | Ctrl+X Ctrl+E | |
| Crush | `crush` | Ctrl+O | ne lit que `EDITOR`, que sa ligne règle à la place de `VISUAL` |
| Grok Build (xAI) | `grok` | Ctrl+G | en mode minimal ; dans l'interface complète, « Edit Prompt in External Editor » dans la palette |

Pas pris en charge, et affichés comme tels quand ils sont installés :

| Agent | Pourquoi |
|---|---|
| Qwen Code | il lance son éditeur comme un seul chemin, sans place pour `rp edit` |
| Cursor CLI, Amp | documentés, pas encore vérifiés dans leur code |
| goose, Kiro CLI | leur éditeur envoie un nouveau prompt au lieu de rendre le brouillon |

Vérifié le 25 novembre 2026 dans le code source de chaque agent, ou dans sa
documentation quand le code est fermé.

## Shells

Reqraft écrit pour le shell nommé par `SHELL`, ou PowerShell sous Windows.
`rp agents --shell <nom>` en choisit un autre.

| Shell | Fichier | Ligne pour Codex |
|---|---|---|
| zsh | `~/.zshrc` | `codex() { VISUAL="rp edit" command codex "$@"; }` |
| bash | `~/.bashrc` | la même qu'en zsh |
| fish | `~/.config/fish/config.fish` | `function codex --wraps codex; VISUAL="rp edit" command codex $argv; end` |
| PowerShell | `$PROFILE` (`Documents/PowerShell/Microsoft.PowerShell_profile.ps1`) | une fonction `codex` qui règle `$env:VISUAL` le temps de l'appel, puis le rétablit |

## Quand ça ne marche pas

**« Cannot open external editor: set $VISUAL or $EDITOR before starting
Codex. »** Cet agent a été lancé depuis un shell qui n'a pas lu la nouvelle
ligne. Quittez-le, ouvrez un nouvel onglet de terminal (ou lancez
`source ~/.zshrc`), puis relancez-le. Avec tmux, les panneaux ouverts avant le
changement gardent leur ancien shell : ouvrez une nouvelle fenêtre.

**« editor exited with status 1 »** : `rp edit` n'a pas pu se lancer. Vérifiez
que `rp --version` marche dans ce terminal, puis lancez `rp doctor`.

**La réécriture a échoué** : la raison reste affichée jusqu'à ce que vous
appuyiez sur Entrée, et votre brouillon revient inchangé.

**Le retirer** : `rp agents --disable`, ou **Désactiver** dans Réglages ›
Agents IA, retire le bloc et laisse le reste du fichier tel quel.
