# Plan d’intégration — identité visuelle + UX terminal de Reqraft

Implémente une amélioration complète de l’identité visuelle et de l’expérience terminal de Reqraft, en t’appuyant sur l’interface actuelle, mais en la faisant évoluer vers une TUI plus moderne, plus lisible, plus hiérarchisée et plus agréable à utiliser.

L’objectif n’est pas de copier OpenCode, mais de s’inspirer de ce qui fait la qualité d’un bon outil terminal moderne :

* clarté ;
* densité maîtrisée ;
* hiérarchie visuelle forte ;
* raccourcis visibles ;
* sensation de fluidité ;
* cohérence ;
* praticité ;
* identité reconnaissable.

Le résultat doit rester **terminal-native**, rapide, sobre, élégant et robuste.

---

# 1. Objectif produit

Créer une véritable identité visuelle pour Reqraft afin que la TUI donne l’impression d’un produit abouti et non d’un simple écran technique.

L’interface doit exprimer :

* précision ;
* netteté ;
* calme ;
* rapidité ;
* utilité ;
* modernité sobre.

Reqraft ne doit pas ressembler à un tableau de bord web recopié dans le terminal. Il doit rester un outil de terminal, mais avec une qualité visuelle assumée.

---

# 2. Diagnostic de l’interface actuelle

À partir de l’état actuel :

* l’interface est très monochrome ;
* les bordures occupent beaucoup d’espace ;
* la hiérarchie entre les zones est faible ;
* le header est trop minimal et peu incarné ;
* les statuts et informations de contexte sont peu mis en valeur ;
* les raccourcis existent mais leur lecture pourrait être bien meilleure ;
* la zone de sortie semble visuellement vide et peu “guidée” ;
* il n’y a pas encore de système visuel suffisamment cohérent entre header, panneaux, statuts, labels et actions.

Il faut conserver la simplicité globale, mais améliorer fortement :

* le contraste utile ;
* le rythme vertical ;
* l’alignement ;
* les états ;
* la microcopie ;
* la structuration de l’espace.

---

# 3. Principes de design à respecter

## 3.1 Terminal-first

L’interface doit être pensée pour un terminal, pas pour le web.

Donc :

* pas d’effets “faux GUI” trop lourds ;
* pas de surcharge décorative ;
* pas de pseudo design skeuomorphique ;
* pas de blocs gigantesques inutilement encadrés ;
* pas de couleurs agressives.

## 3.2 Sobriété premium

L’identité doit être :

* minimaliste ;
* précise ;
* lisible ;
* élégante ;
* légèrement technique ;
* légèrement chaleureuse, mais pas “gaming”.

## 3.3 Couleur au service de la hiérarchie

La couleur doit servir à distinguer :

* la structure ;
* les éléments interactifs ;
* les états actifs ;
* les aides contextuelles ;
* les succès / erreurs / warning.

Elle ne doit pas être utilisée partout.

## 3.4 Densité maîtrisée

L’interface doit gagner en informations utiles sans devenir chargée.

## 3.5 Clavier d’abord

Tout le design doit soutenir la navigation au clavier.

---

# 4. Direction visuelle recommandée

Créer un petit design language terminal pour Reqraft.

## 4.1 Personnalité visuelle

Reqraft doit évoquer :

* un atelier de formulation ;
* un outil précis ;
* une interface calme ;
* une sensation d’assistant discret.

## 4.2 Palette

Définir une palette terminal cohérente avec fallback propre si les couleurs ne sont pas supportées.

Créer des rôles de couleurs, pas des couleurs utilisées en dur dans les composants.

Exemple de rôles :

* `colorTextPrimary`
* `colorTextMuted`
* `colorTextSubtle`
* `colorBorder`
* `colorPanel`
* `colorAccent`
* `colorAccentSoft`
* `colorSuccess`
* `colorWarning`
* `colorDanger`
* `colorInfo`

Direction recommandée :

* base sombre ;
* texte principal clair mais pas blanc pur partout ;
* accent principal discret mais identifiable ;
* secondaires doux.

Exemple d’ambiance :

* fond noir ou quasi noir ;
* gris froid pour structure ;
* accent bleu/violet ou cyan/bleu très subtil ;
* vert sobre pour succès ;
* ambre doux pour warning ;
* rouge mesuré pour erreur.

Ne code pas les couleurs en dur partout. Centralise-les dans des tokens.

## 4.3 Typologie visuelle

Différencier visuellement :

* titres d’écran ;
* labels ;
* métadonnées ;
* valeurs ;
* aides ;
* raccourcis ;
* messages système ;
* contenu utilisateur ;
* contenu généré.

---

# 5. Système de design terminal

Créer une couche de design UI réutilisable pour la TUI.

## 5.1 Tokens

Créer un module de tokens :

```text
src/ui/theme/tokens.ts
src/ui/theme/palette.ts
src/ui/theme/types.ts
```

Y définir :

* palette ;
* espacements ;
* variantes de bordure ;
* styles de labels ;
* styles de statuts ;
* styles de panneaux.

## 5.2 Composants de base

Créer des composants réutilisables, sans suringénierie.

Exemples :

```text
AppFrame
HeaderBar
SectionCard
StatusBadge
KeyHint
ShortcutBar
FieldLabel
MetaRow
Divider
Notice
EmptyState
PanelTitle
```

Chaque composant doit exprimer le design system.

## 5.3 Variantes de panneaux

Au lieu de tout encadrer de la même façon, prévoir plusieurs niveaux :

* panneau principal ;
* panneau secondaire ;
* encart discret ;
* bloc inline sans bordure.

L’objectif est d’éviter une “prison de rectangles”.

---

# 6. Refonte visuelle de la TUI principale

Refondre l’écran principal autour de 4 zones.

## 6.1 Header

Le header doit devenir plus fort visuellement.

Contenu recommandé :

* nom du produit : `reqraft` ou `rp`
* contexte terminal / shell en discret
* provider actif
* modèle actif
* éventuellement état de configuration

Exemple d’intention :

```text
reqraft
Refine raw requests for AI agents
```

Ne pas le surcharger.

Ajouter une meilleure hiérarchie entre :

* marque ;
* sous-titre ;
* métadonnées à droite.

## 6.2 Zone de saisie

La zone “Prompt original” doit être plus accueillante.

Améliorations :

* titre plus net ;
* placeholder mieux écrit ;
* meilleur contraste ;
* état de focus plus visible ;
* hauteur gérée intelligemment ;
* compteur optionnel de lignes ou de caractères si utile, mais discret.

Le placeholder peut mieux guider :

* brut ;
* rapide ;
* naturel.

Par exemple :

```text
Écris ta demande brute, même imparfaite…
```

## 6.3 Barre de contexte

Entre entrée et sortie, créer une vraie barre de contexte avec :

* profil ;
* niveau ;
* provider ;
* modèle ;
* éventuellement mode copy ou stream.

Cela doit utiliser des badges ou chips, pas juste du texte aligné pauvrement.

Exemple :

```text
Profil  auto   Niveau  standard   Provider  anthropic   Model  claude-haiku-4-5
```

Mais avec une vraie stylisation terminal.

## 6.4 Zone de résultat

La zone “Prompt amélioré” doit devenir le centre de l’expérience.

Elle doit avoir des états clairs :

* vide ;
* prêt à générer ;
* génération en cours ;
* succès ;
* erreur ;
* résultat affiché ;
* mode diff ;
* mode explication.

Le message vide actuel peut être amélioré :

```text
Aucun résultat pour le moment.
Appuie sur Ctrl+Enter pour générer une reformulation.
```

Pendant la génération, afficher un état vivant mais sobre :

* spinner ;
* texte court ;
* éventuellement étape si possible.

---

# 7. Barre de raccourcis

La barre de raccourcis du bas est une bonne idée, mais elle doit être mieux hiérarchisée.

Objectif :

* rendre les commandes immédiatement compréhensibles ;
* mieux distinguer raccourci et action ;
* mieux grouper les actions.

Créer un composant `ShortcutBar`.

Chaque item doit avoir :

* la touche ;
* l’action ;
* un style visuel cohérent.

Exemple de structure :

```text
Ctrl+Enter  Générer
Ctrl+P      Profil
Ctrl+L      Niveau
Ctrl+M      Modèle
Ctrl+D      Diff
Ctrl+R      Régénérer
?           Aide
Esc         Quitter
```

Améliorer la lisibilité via :

* couleur spécifique des touches ;
* séparateurs discrets ;
* états désactivés si une action n’est pas disponible.

---

# 8. États et feedback utilisateur

L’interface doit devenir plus expressive.

## 8.1 États de chargement

Créer un vrai style de chargement :

* spinner discret ;
* message clair ;
* durée éventuellement affichable ;
* pas d’animation trop bruyante.

## 8.2 États de succès

Afficher les succès avec une indication visuelle légère.

Exemples :

* génération terminée ;
* copie réussie ;
* configuration chargée ;
* profil changé.

## 8.3 États d’erreur

Les erreurs doivent être :

* visibles ;
* lisibles ;
* non agressives ;
* actionnables.

Afficher :

* le problème ;
* la cause probable ;
* la prochaine action suggérée.

## 8.4 États vides

Prévoir de vrais empty states pour :

* pas encore de résultat ;
* mode diff non disponible ;
* explication non disponible ;
* provider non configuré.

---

# 9. Amélioration de la praticité

L’identité visuelle doit servir l’usage.

## 9.1 Navigation plus fluide

Vérifier et améliorer :

* focus visible ;
* ordre logique de navigation ;
* cohérence Tab / Shift+Tab ;
* raccourcis toujours disponibles ;
* gestion d’Esc ;
* retour au champ principal.

## 9.2 Command palette légère

Si c’est faisable sans alourdir le projet, ajouter une petite palette d’actions accessible au clavier.

Exemple :

* changer de profil ;
* changer de niveau ;
* changer de modèle ;
* copier ;
* afficher le diff ;
* afficher l’explication ;
* ouvrir l’aide.

Raccourci recommandé :

```text
Ctrl+K
```

Si cette fonctionnalité complique trop la V1, la préparer architecturalement mais ne pas la forcer.

## 9.3 Aide intégrée

Le `?` doit ouvrir une aide claire :

* raccourcis ;
* modes ;
* astuces ;
* commandes utiles.

Cette aide doit utiliser le même design system.

## 9.4 Toasts / notifications discrètes

Si possible, ajouter un système léger de notifications terminal :

* `Copié dans le presse-papiers`
* `Profil changé : frontend`
* `Modèle changé : claude-haiku-4-5`

Elles doivent être discrètes et temporaires.

---

# 10. Écrans secondaires à harmoniser

L’identité visuelle ne doit pas s’arrêter à l’écran principal.

Appliquer le même langage visuel à :

* `rp init`
* `rp doctor`
* `rp config`
* `rp profiles`
* `rp models`
* `rp providers`
* les écrans de sélection
* les modales ou panneaux d’aide éventuels

Objectif :

* même style de header ;
* même système de badges ;
* mêmes couleurs sémantiques ;
* même traitement des panneaux ;
* même barre d’aide ou de pied de page quand pertinent.

---

# 11. Inspiration OpenCode, sans copier

S’inspirer de la qualité perçue d’OpenCode sur les points suivants :

* interface terminal nette ;
* structuration claire ;
* hiérarchie visuelle lisible ;
* raccourcis utiles ;
* sensation d’outil premium.

Mais ne pas reproduire son identité.

Reqraft doit avoir sa propre personnalité :

* plus centré sur la reformulation ;
* plus sobre ;
* plus “atelier de précision” ;
* moins “agent de code”.

---

# 12. Microcopy

Revoir les textes affichés dans l’interface.

La microcopy doit être :

* courte ;
* claire ;
* utile ;
* cohérente ;
* dans une seule langue par contexte.

Décide d’une stratégie claire :

* soit interface entièrement en français ;
* soit interface entièrement en anglais ;
* soit i18n structurée si cela existe déjà.

Si aucune i18n n’est en place, ne crée pas un système massif inutile. Mais évite un mélange incohérent.

Exemples de textes à revoir :

* placeholders ;
* titres de panneaux ;
* empty states ;
* labels ;
* messages de chargement ;
* confirmations ;
* erreurs.

---

# 13. Accessibilité terminal

Même en TUI, penser accessibilité.

Améliorer :

* contraste ;
* lisibilité ;
* dépendance limitée à la couleur seule ;
* icônes ASCII / Unicode simples si utiles ;
* compatibilité avec terminaux sans couleurs avancées ;
* comportement correct en petite largeur ;
* reflow acceptable.

Ajouter des fallbacks propres si le terminal ne supporte pas certaines couleurs.

---

# 14. Responsive terminal

L’interface doit mieux se comporter selon la taille du terminal.

Prévoir au minimum :

## Large terminal

* layout complet ;
* métadonnées bien réparties ;
* deux ou trois zones clairement espacées.

## Terminal moyen

* simplifier certaines lignes ;
* réduire les marges ;
* condenser les badges ;
* tronquer proprement certaines métadonnées.

## Petit terminal

* version dégradée élégante ;
* simplifier le header ;
* réduire la barre de raccourcis ;
* éviter les panneaux trop hauts ;
* garantir que l’outil reste utilisable.

Ne suppose pas un très grand terminal.

---

# 15. Architecture technique

Ne fais pas une simple passe cosmétique inline dans chaque composant.

Créer une structure claire, par exemple :

```text
src/ui/theme/
src/ui/components/
src/ui/layout/
src/ui/hooks/
src/ui/utils/
```

Exemple :

```text
src/ui/theme/palette.ts
src/ui/theme/tokens.ts
src/ui/components/AppFrame.tsx
src/ui/components/HeaderBar.tsx
src/ui/components/SectionCard.tsx
src/ui/components/StatusBadge.tsx
src/ui/components/ShortcutBar.tsx
src/ui/components/EmptyState.tsx
src/ui/components/Notice.tsx
src/ui/components/Spinner.tsx
```

Refactoriser progressivement l’écran principal pour consommer ces composants.

Le design system doit être simple, maintenable et réutilisable.

---

# 16. Dépendances

N’ajoute pas de dépendances lourdes juste pour le style.

Utilise en priorité :

* Ink ;
* les primitives déjà en place ;
* les capacités terminal ;
* une couche maison légère.

Si une petite dépendance est réellement utile pour le rendu ou les couleurs, elle doit être justifiée.

Évite toute dépendance gadget.

---

# 17. Performance

L’amélioration visuelle ne doit pas dégrader :

* le temps de démarrage ;
* la fluidité de frappe ;
* la navigation ;
* le rendu ;
* la stabilité.

Surveille :

* rerenders inutiles ;
* composants trop bavards ;
* calculs visuels répétés ;
* animations trop fréquentes.

La TUI doit rester rapide.

---

# 18. Lots d’implémentation

## Lot A — Audit + direction visuelle

* auditer l’interface existante ;
* formaliser la direction visuelle ;
* définir palette, rôles de couleurs, typographie terminale et principes ;
* documenter rapidement les choix dans `docs/tui-design.md`.

## Lot B — Design system terminal

* créer les tokens ;
* créer la couche thème ;
* créer les composants de base ;
* préparer les variantes de panneaux, badges, labels et shortcut items.

## Lot C — Refonte de l’écran principal

* refaire le header ;
* refaire la zone de saisie ;
* refaire la barre de contexte ;
* refaire la zone de sortie ;
* refaire la barre de raccourcis ;
* améliorer les empty states, loading, success et error states.

## Lot D — Praticité et interactions

* améliorer focus et navigation ;
* harmoniser les raccourcis ;
* ajouter aide intégrée ;
* ajouter toasts si pertinent ;
* ajouter ou préparer une command palette légère si faisable proprement.

## Lot E — Harmonisation des écrans secondaires

* appliquer le design system à `init`, `doctor`, `config`, `profiles`, `models`, `providers` ;
* harmoniser les feedbacks et messages.

## Lot F — Responsive terminal + robustesse

* tester plusieurs tailles de terminal ;
* gérer les petites largeurs ;
* améliorer les fallbacks ;
* corriger les débordements et problèmes d’alignement.

## Lot G — Documentation + polish

* documenter le design system ;
* mettre à jour le README si nécessaire ;
* ajouter captures si utile ;
* corriger les derniers détails visuels et textuels.

---

# 19. Tests et validations

Après chaque lot, exécuter obligatoirement :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Ajouter si possible des tests ciblés sur :

* le rendu en différentes largeurs ;
* les composants de base ;
* l’absence de crash si certaines infos sont absentes ;
* les états vides ;
* les états d’erreur.

Tester manuellement :

* thème par défaut ;
* navigation clavier ;
* génération ;
* changement de profil ;
* changement de niveau ;
* changement de modèle ;
* affichage du diff ;
* aide ;
* écrans secondaires ;
* petit terminal ;
* grand terminal.

---

# 20. WORKLOG et commits

Maintiens `WORKLOG.md` à jour pendant toute l’intervention.

Le journal doit inclure :

* lot en cours ;
* décisions de design ;
* composants créés ;
* fichiers modifiés ;
* validations exécutées ;
* limites restantes ;
* prochaine étape.

À la fin de chaque lot, ne crée un commit que si :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

réussissent tous.

Utilise un commit distinct par lot, par exemple :

```text
feat(ui): add terminal design system
feat(tui): redesign main reqraft interface
feat(ux): improve keyboard navigation and help
feat(ui): harmonize secondary terminal screens
```

---

# 21. Critères d’acceptation

Le travail est terminé lorsque :

1. Reqraft a une identité visuelle terminal cohérente.
2. L’écran principal paraît plus propre, plus hiérarchisé et plus agréable.
3. Le produit ne ressemble plus à une interface brute encadrée uniformément.
4. Les raccourcis sont mieux lisibles et mieux structurés.
5. Les états vides, chargement, succès et erreurs sont clairs.
6. La navigation clavier est meilleure.
7. Les écrans secondaires utilisent le même langage visuel.
8. Le rendu tient sur différentes tailles de terminal.
9. Les performances restent bonnes.
10. Le projet passe toujours :

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

11. `WORKLOG.md` est à jour.
12. Les commits sont propres et séparés par lot.

---

# 22. Résultat attendu en fin d’intervention

À la fin, fournis :

* un résumé des améliorations visuelles ;
* les choix de design retenus ;
* l’arborescence des nouveaux composants UI ;
* les captures ou descriptions des écrans principaux ;
* les scénarios testés ;
* les résultats exacts des validations ;
* les commits créés ;
* les limites restantes ;
* les prochaines pistes si on veut aller encore plus loin.
