import type { RepromptRequest } from "./types.js";
import type { PromptProfile } from "../profiles/types.js";
import { BASE_SYSTEM_PROMPT } from "../profiles/base.js";
import { describeLevel } from "./levels.js";

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface PromptBuildInput {
  input: string;
  profile: PromptProfile;
  level: RepromptRequest["level"];
  language?: string;
  includeChanges: boolean;
}

export function buildPrompt(request: PromptBuildInput): BuiltPrompt {
  const levelDescription = describeLevel(request.level);

  const systemPrompt = [
    "Tu es un assistant de reprompting. Tu reformules des demandes brutes en prompts clairs, fidèles et directement exploitables par une IA.",
    "",
    "Règles communes :",
    BASE_SYSTEM_PROMPT,
    "",
    `Profil actif : ${request.profile.name}`,
    request.profile.description,
    "",
    "Instructions spécifiques au profil :",
    request.profile.instructions,
    "",
    levelDescription,
    "",
    request.includeChanges
      ? "Réponds au format JSON strict avec les champs : rewritten (string), changes (string[]), warnings (string[])."
      : "Réponds au format JSON strict avec les champs : rewritten (string), warnings (string[]).",
    "Ne mets pas de Markdown autour du JSON.",
  ].join("\n");

  const userPrompt = [
    "Reformule la demande suivante :",
    "",
    "```",
    request.input,
    "```",
    request.language ? `\nLangue attendue : ${request.language}` : "",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

export function buildMinimalPrompt(input: string): BuiltPrompt {
  const systemPrompt = [
    "Tu es un assistant de reprompting. Reformule la demande brute suivante en un prompt clair et fidèle.",
    "Règles : conserve l'intention, corrige les fautes, ne invente rien.",
    "Réponds au format JSON strict avec : rewritten (string), changes (string[]), warnings (string[]).",
  ].join("\n");

  return {
    systemPrompt,
    userPrompt: `Reformule :\n\n${input}`,
  };
}
