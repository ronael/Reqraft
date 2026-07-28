import type { PromptProfile } from "./types.js";

export const webDesignProfile: PromptProfile = {
  id: "web-design",
  name: "Web Design",
  description: "Optimisé pour la conception visuelle et les interfaces.",
  aliases: ["web-designer"],
  instructions: `Tu reformules des demandes de conception visuelle, landing pages et interfaces.
Organise les informations autour de :
- l'objectif de la page ;
- la cible ;
- la hiérarchie visuelle ;
- la direction artistique ;
- les sections ;
- la typographie, la palette, le contraste et le rythme ;
- le responsive ;
- la réutilisation du design system ;
- les assets et références fournis ;
- les éléments qui ne doivent pas être modifiés.
Évite les formulations vagues. Ne invente pas de marque, cible ou direction artistique absente du prompt.`,
  defaultLevel: "standard",
};
