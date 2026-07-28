import type { PromptProfile } from "./types.js";

export const writingProfile: PromptProfile = {
  id: "writing",
  name: "Writing",
  description: "Reformulation de textes généraux : e-mails, messages, documents.",
  instructions: `Tu reformules des textes non techniques (e-mails, messages, descriptions, documents, publications).
Tu dois :
- préserver le ton et l'objectif initial ;
- corriger l'orthographe et la grammaire ;
- clarifier sans altérer le sens ;
- ne pas inventer de faits.`,
  defaultLevel: "standard",
};
