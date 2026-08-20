# Ajout de profils locaux

## Décision

La première version sera accessible depuis le **CLI**. Le stockage, la
validation et le chargement seront placés dans les modules partagés afin que
l'application desktop puisse les réutiliser plus tard via son processus
principal et IPC, sans dupliquer la logique.

Chaque profil sera un fichier JSON local, stocké dans le répertoire de profils
de Reqraft : `~/.config/rp/profiles/` sous Linux, avec les emplacements
équivalents Windows et macOS déjà définis par `src/config/paths.ts`.

## Format retenu

Un fichier par profil, par exemple `support-client.json` :

```json
{
  "schemaVersion": 1,
  "id": "support-client",
  "name": "Support client",
  "description": "Reformule les réponses destinées au support.",
  "extends": "clean",
  "defaultLevel": "standard",
  "instructions": "Rédige une réponse empathique, précise et actionnable."
}
```

Le champ `schemaVersion` permet de faire évoluer le format et de migrer les
fichiers existants. Les champs supplémentaires inconnus devront être refusés
au départ, pour éviter qu'une faute de frappe soit silencieusement ignorée.

## Première étape : CLI

### Comportement minimal

- `rp profiles add` ouvre un assistant demandant l'identifiant, le nom, la
  description, le niveau par défaut et les instructions.
- Il crée un fichier JSON de façon atomique.
- `rp profiles` liste les profils intégrés et les profils locaux.
- `rp --profile <id>` et le sélecteur de profils du TUI reconnaissent le
  nouveau profil grâce au registre partagé.
- Les profils locaux persistent après redémarrage.

Une importation non interactive sera aussi prévue :

```bash
rp profiles add --file ./support-client.json
```

Elle facilite l'automatisation, le partage explicite d'un profil et les tests,
sans créer de mécanisme de synchronisation automatique.

### Limites assumées de la V1

- Création, importation et lecture seulement ; l'édition et la suppression
  viendront dans une étape séparée.
- Les profils restent locaux à la machine. Le fichier JSON reste exportable et
  importable manuellement.
- `extends` ne peut viser qu'un profil intégré. Autoriser un profil local à en
  étendre un autre impose une résolution de graphe et la détection de cycles ;
  ce n'est pas nécessaire au premier usage.

## Architecture

### Modules partagés

- `src/profiles/custom.ts` : schéma JSON versionné, parsing et validation.
- Nouveau service dans `src/profiles/` : liste, création atomique et lecture
  des fichiers locaux.
- `src/profiles/registry.ts` : fusion des profils intégrés et locaux, contrôle
  des collisions puis résolution unique utilisée par toutes les surfaces.
- `src/config/paths.ts` : unique source pour le répertoire de profils.

### CLI et TUI

- `src/apps/cli/cli-program.ts` : sous-commandes `rp profiles add` et
  `rp profiles add --file`.
- `src/apps/cli/commands/list.ts` : catalogue incluant les profils locaux.
- Les appels déjà fondés sur `listProfiles()` et `resolveProfile()` (option
  `--profile`, premier lancement et TUI) restent les points d'intégration.

Avant toute évolution de l'interface TUI, la documentation OpenTUI du
composant effectivement utilisé doit être consultée.

### Préparation desktop (ultérieure)

- Ajouter les canaux dans `src/apps/desktop/shared/ipc-channels.ts`.
- Définir les schémas Zod et contrats dans
  `src/apps/desktop/shared/ipc-contract.ts`.
- Brancher les handlers dans `src/apps/desktop/main/ipc.ts` et les exposer via
  `src/apps/desktop/preload/index.ts`.
- Ajouter le formulaire à l'onglet Profils de
  `src/apps/desktop/renderer/settings/SettingsApp.tsx`.

Le renderer Electron ne lit ni n'écrit les fichiers : seul le processus
principal appelle les services partagés. Les instructions ne traversent pas
l'IPC lorsque la liste n'a besoin que de l'identité et de la description.

## Validations

- `id` obligatoire, normalisé (`a-z`, chiffres et tirets), unique et stable.
- Interdiction de `auto`, des identifiants intégrés et de toute collision avec
  un profil local existant.
- Nom, description et instructions obligatoires et non vides ; niveau valide.
- `schemaVersion` obligatoire et pris en charge.
- Nom de fichier dérivé de l'identifiant, jamais d'un chemin saisi par
  l'utilisateur ; protection contre les traversées de répertoires.
- Écriture atomique ; un fichier invalide produit une erreur explicite.

## Tests et critères d'acceptation

- Tests unitaires du schéma, des migrations futures, des collisions, du
  chargement et de l'écriture atomique.
- Tests CLI : ajout interactif, import `--file`, catalogue et utilisation avec
  `--profile`.
- Tests TUI : le nouveau profil est présent dans le sélecteur et utilisable.
- Lors du lot desktop : tests IPC, formulaire de création, rafraîchissement du
  catalogue et utilisation dans une génération.
- Les tests de parité des capacités seront mis à jour si la création de profil
  est exposée comme capacité sur plusieurs surfaces.

Un profil est accepté lorsqu'il peut être créé depuis le CLI, reste présent
après redémarrage, apparaît dans `rp profiles` et dans le TUI, puis est utilisé
par une génération avec `rp --profile <id>`. Un profil invalide ou en conflit
est refusé avec un message exploitable.
