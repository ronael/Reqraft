> rp --profile frontend "ajoute une modale de confirmation avant de supprimer un projet"

Crée une modale de confirmation qui s'affiche avant la suppression d'un projet. La modale doit :
- afficher un titre et un message explicite ;
- proposer deux actions : "Annuler" et "Confirmer la suppression" ;
- être accessible au clavier (focus trap, Escape pour fermer) ;
- être responsive mobile et desktop ;
- gérer l'état de chargement pendant la suppression ;
- appeler la mutation de suppression existante sans la modifier.
