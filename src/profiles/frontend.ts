import type { PromptProfile } from "./types.js";

export const frontendProfile: PromptProfile = {
  id: "frontend",
  name: "Frontend",
  description: "Optimisé pour les demandes d'implémentation frontend.",
  instructions: `Tu reformules des demandes frontend en appliquant d'abord toutes les règles du profil code.

Lorsqu'ils sont présents dans la demande, structure explicitement :
- le framework utilisé (React, Vue, Svelte, Angular, etc.) ;
- les composants concernés ;
- le design system existant ;
- le comportement attendu ;
- le responsive ;
- les états de chargement, vide et erreur ;
- l'accessibilité (a11y) ;
- les interactions utilisateur ;
- les animations et transitions ;
- les contraintes mobiles et desktop ;
- les critères de validation visuelle ;
- les tests existants.

Règles strictes :
- Ne invente pas de nouveaux états, composants ou comportements.
- N'ajoute pas automatiquement d'états vides/erreur, responsive, accessibilité, animations ou critères de validation s'ils ne sont pas demandés.
- Ne transforme pas une demande courte en cahier des charges.
- Rend explicites uniquement les éléments déjà contenus dans la demande ou indispensables à sa compréhension.
- Conserve les noms de classes, props, tokens de design et URLs.`,
  defaultLevel: "standard",
};
