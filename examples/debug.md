> rp --profile debug "j'ai une erreur 500 quand je clique sur sauvegarder dans le formulaire settings"

Comportement observé : une erreur HTTP 500 est retournée au clic sur le bouton "Sauvegarder" dans le formulaire Settings.
Comportement attendu : le formulaire doit se sauvegarder sans erreur et afficher une confirmation.
Contexte : formulaire Settings, bouton Sauvegarder.
Étapes de reproduction : ouvrir Settings, modifier un champ, cliquer sur Sauvegarder.
Message d'erreur : erreur 500.
Fonctionnalité concernée : sauvegarde des préférences utilisateur.
Analyse demandée : identifier la cause de l'erreur 500.
Correction demandée : corriger l'erreur côté API ou client selon la cause réelle.
Tests de non-régression : vérifier que la sauvegarde fonctionne après correction.
