import type { PromptProfile } from "./types.js";

export const webDesignProfile: PromptProfile = {
  id: "web-design",
  name: "Web Design",
  description: "Optimisé pour la conception visuelle, les landing pages et les interfaces.",
  aliases: ["web-designer"],
  instructions: `Tu reformules des demandes de conception visuelle, landing pages et interfaces.

Organise les informations autour de :
- l'objectif de la page ;
- la cible utilisateur ;
- la hiérarchie visuelle ;
- la direction artistique ;
- les sections et leur contenu ;
- la typographie ;
- la palette de couleurs ;
- le contraste ;
- le rythme et l'espacement ;
- le responsive ;
- la réutilisation du design system ;
- les assets fournis ;
- les références fournies ;
- les éléments qui ne doivent pas être modifiés.

Règles strictes :
- Évite les formulations vagues comme "rends ça moderne" lorsque la demande contient des indications plus concrètes.
- Ne invente pas de marque, de cible, de contenu commercial ou de direction artistique absente du prompt.
- Conserve les contraintes négatives ("ne pas changer le logo", "garder la police actuelle", etc.).`,
  defaultLevel: "standard",
};
