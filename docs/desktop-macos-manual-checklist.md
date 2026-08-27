# Checklist de test manuel — desktop macOS

À dérouler sur le **paquet macOS packagé** (`.dmg` ou `.zip` de la release, ou
la sortie de `pnpm build:desktop` puis `electron-builder`), pas sur
`dev:desktop`. Objectif : prouver que l'application s'ouvre, capture une
sélection et réinjecte du texte — trois claims distincts de « le build passe ».

Référence normative : `docs/internal/DESKTOP.md`. Support des plateformes :
`docs/desktop-platform-support.md`.

## Comment s'en servir

- Cocher chaque ligne uniquement après avoir vu le résultat attendu.
- Une ligne qui échoue bloque la release desktop tant qu'elle n'est pas
  corrigée ou explicitement assumée dans `docs/internal/WORKLOG.md`.
- Environnement : vérifier `echo $ELECTRON_RUN_AS_NODE` vide avant tout
  (DESKTOP.md §5.11), sinon l'app packagée quitte en silence avec le code 0.

---

## 1. App packagée macOS

- [ ] Le `.dmg` monte, l'app se copie dans `/Applications`, se lance au premier
      double-clic (override Gatekeeper attendu tant que non signée/notarisée).
- [ ] Aucune icône dans le Dock ; l'icône est présente dans la menu bar (app
      accessoire, `LSUIElement`).
- [ ] Le menu de la barre et l'infobulle du tray sont dans la langue résolue au
      démarrage (config → `REQRAFT_UI_LOCALE` → langue système → `en`).
- [ ] La version affichée dans les réglages correspond à `src/version.ts`.
- [ ] Aucune requête réseau autre que le provider configuré (vérifier au
      moniteur réseau pendant une session complète).

## 2. Permissions Accessibilité et Automatisation

- [ ] Premier lancement : **aucune** fenêtre de permission système n'apparaît
      spontanément (DESKTOP.md §5.9).
- [ ] Déclencher une capture sans permission → la capsule s'ouvre en mode
      dégradé explicite, l'app n'est jamais bloquée.
- [ ] Le message de dégradation et le Diagnostic nomment **laquelle** des deux
      permissions manque (Accessibilité vs Automatisation).
- [ ] Accorder l'Accessibilité seule → une action d'injection échoue encore ;
      le message pointe l'Automatisation (erreur `osascript -1002`).
- [ ] Les deux permissions accordées → capture et remplacement fonctionnent
      sans relance de l'app.
- [ ] Révoquer une permission pendant que l'app tourne → l'état se met à jour
      (au plus au prochain déclenchement), sans crash.

## 3. Capture de la sélection

Tester dans **trois applications différentes** (ex. Safari, Notes, VS Code).

- [ ] Sélection de texte + raccourci avec sélection → la capsule s'ouvre ancrée
      près du curseur, le texte capturé est le bon.
- [ ] Aucune sélection + raccourci avec sélection → capsule centrée en saisie
      libre (`nothing-to-capture`), pas d'attente inutile.
- [ ] Sélection identique au contenu courant du presse-papiers → toujours
      capturée (le vidage préalable distingue « rien » de « identique »).
- [ ] **Presse-papiers intact après capture** : contenu et format identiques
      avant/après, y compris après une capture annulée ou en erreur
      (`try/finally`, DESKTOP.md §5.1).

## 4. Remplacement

- [ ] `⏎` sur un résultat prêt → le texte de l'application source est remplacé
      par le résultat, la capsule se ferme.
- [ ] Le focus revient à l'application source ; `⌘V` n'atterrit jamais dans la
      capsule (DESKTOP.md §5.2).
- [ ] Presse-papiers de l'utilisateur identique avant/après le remplacement.
- [ ] Application source qui ne repasse pas au premier plan → le refus est
      signalé avec sa raison, pas un échec muet.
- [ ] `⌘Z` dans l'application source annule le remplacement (le collage est une
      seule frappe).

## 5. Fallback copie (mode plancher)

- [ ] Sans permission d'injection (ou en contexte où l'injection est refusée) →
      `⏎` **copie** le résultat au lieu de remplacer, et l'interface le dit.
- [ ] `⌘C` dans la capsule copie le résultat dans tous les cas.
- [ ] Après une copie de secours, le presse-papiers porte bien le résultat
      reformulé (et non l'ancien contenu restauré par-dessus).

## 6. Popover

- [ ] Clic sur l'icône tray → le popover s'ouvre, ancré au tray.
- [ ] Saisie / collage de texte, choix provider, modèle, niveau, profil.
- [ ] `⌘⏎` lance la reformulation ; le dernier résultat reste visible.
- [ ] Ouverture des réglages depuis le popover.
- [ ] Perte de focus → le popover se ferme sans laisser de fenêtre fantôme.

## 7. Raccourcis configurés

- [ ] Les deux raccourcis globaux par défaut se déclenchent (avec sélection /
      saisie libre centrée).
- [ ] Changer un raccourci dans les réglages → ré-enregistrement à chaud, le
      nouveau raccourci marche sans relance.
- [ ] Choisir un raccourci déjà pris → l'échec est affiché, un repli est
      proposé ; jamais silencieux (DESKTOP.md §5.5).
- [ ] Choisir un raccourci intercepté par macOS (ex. `⌘Espace`) → `register()`
      peut renvoyer `true` mais le raccourci ne se déclenche pas ; la
      confirmation par l'usage doit le détecter.
- [ ] Raccourcis de la capsule : `⌥` maintenu (comparaison), `⌘C`, `⌘R`, `⇥`
      (niveau suivant), `⌘.` (interrompre), `esc` (fermer).

## 8. Relance après changement de langue

- [ ] Réglages → Préférences → changer la langue d'interface (`fr` ↔ `en`).
- [ ] L'interface annonce que Reqraft redémarre automatiquement.
- [ ] L'application **se relance automatiquement**.
- [ ] Après relance, la fenêtre de réglages **se rouvre sur l'onglet
      Préférences**, dans la nouvelle langue.
- [ ] Menu de la barre, titres de fenêtre et infobulle du tray sont entièrement
      dans la nouvelle langue (pas de mélange).

## 9. Seconde instance

- [ ] App déjà lancée, ouvrir une seconde instance → aucune nouvelle instance ;
      une fenêtre existante repasse au premier plan.
- [ ] Le raccourci global continue de fonctionner (pas de vol entre instances,
      DESKTOP.md §5.8).

## 10. Provider mock et erreur provider

- [ ] Provider `mock` configuré → cycle complet capture → capsule → résultat →
      remplacement sans réseau.
- [ ] Le verdict de fidélité s'affiche **avant** le texte reformulé.
- [ ] Provider en erreur (clé absente ou invalide, endpoint injoignable) → la
      capsule passe en état `error` avec un message lisible, pas de sablier
      figé ; `esc` ferme proprement.
- [ ] Après une erreur, `⌘R` relance une génération depuis `analysis` (barre
      d'activité visible, pied cohérent).
- [ ] Génération interrompue avec `⌘.` → texte partiel conservé si présent,
      sinon fermeture ; aucun abonnement de streaming ne fuit (relancer
      plusieurs fois, vérifier l'absence de doublons de `run:delta`).

## 11. Presse-papiers image

- [ ] Copier une image (Aperçu, capture d'écran `⌘⇧4`), sélectionner du texte,
      déclencher le raccourci → **pas de tentative de capture** : la capsule
      s'ouvre centrée en saisie libre (DESKTOP.md §5.1).
- [ ] L'image est toujours dans le presse-papiers après coup (aucun
      aller-retour destructeur).

## 12. Mesure du cycle sélection → capsule → remplacement

- [ ] Chronométrer, hors temps provider, le trajet
      `sélection → raccourci → capsule visible → résultat → remplacement
      appliqué`.
- [ ] Cible : **< 1 s** hors provider (critère DESKTOP.md §11.1) ; le cycle
      capture + réinjection seul doit rester **< 400 ms** (DESKTOP.md §6).
- [ ] Répéter 5 fois de suite dans la même application : pas de dérive, pas de
      ralentissement progressif.
- [ ] Reporter les valeurs mesurées dans `docs/internal/WORKLOG.md` avec la
      version testée et le matériel.
