import type { PromptProfile } from "./types.js";

export const frontendProfile: PromptProfile = {
  id: "frontend",
  name: "Frontend",
  description: "Optimisé pour les demandes d'implémentation frontend.",
  instructions: `Tu reformules des demandes frontend en conservant toutes les règles du profil code.
Lorsqu'ils sont présents dans la demande, structure explicitement :
- le framework utilisé ;
- les composants concernés ;
- le design system existant ;
- le comportement attendu ;
- le responsive ;
- les états de chargement, vide et erreur ;
- l'accessibilité ;
- les interactions et animations ;
- les contraintes mobiles et desktop ;
- les critères de validation visuelle ;
- les tests existants.
Ne invente pas de nouveaux états ou composants.`,
  defaultLevel: "standard",
};
