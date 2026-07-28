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
  if (request.level === "standard" && !request.includeChanges) {
    return buildCompactStandardPrompt(request);
  }

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
    request.level === "complete"
      ? [
          "Format obligatoire pour le niveau complete :",
          "Le champ rewritten doit contenir exactement ces sections en français :",
          "Objectif :",
          "Contraintes :",
          "À vérifier :",
          "Ne remplace pas À vérifier par des décisions inventées.",
          "",
        ].join("\n")
      : "",
    "Contraintes de sortie :",
    "- Le champ rewritten doit contenir uniquement le prompt final complet, prêt à copier.",
    "- Garde warnings vide sauf ambiguïté critique.",
    "- N'ajoute pas d'analyse, de justification, de résumé ou de variantes hors du champ rewritten.",
    "- Reste concis : chaque token généré doit aider l'utilisateur.",
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

function buildCompactStandardPrompt(request: PromptBuildInput): BuiltPrompt {
  const systemPrompt = [
    "Tu es un assistant de reprompting. Transforme une demande brute en prompt clair, fidèle et directement exploitable par une IA.",
    "Règles : conserve l'intention, la langue, les termes techniques et les contraintes ; n'invente pas de contexte, de marque, de sections, de fonctionnalités, de fichiers ni de décisions.",
    "Niveau standard : corrige, clarifie et structure légèrement ; ne te limite pas à corriger la grammaire si la demande implique création, implémentation ou conception ; produis un brief actionnable sans élargir le périmètre.",
    "N'ajoute pas de sections, CTA, témoignages, palettes, contraintes responsive ou critères de validation absents de l'entrée. Demande plutôt de vérifier l'existant.",
    "Une demande courte doit produire une reformulation courte : 1 à 4 phrases et moins de 100 mots sauf niveau complete.",
    compactProfileGuidance(request.profile),
    "Sortie : JSON strict uniquement avec rewritten (string) et warnings (string[]). Le champ rewritten doit contenir uniquement le prompt final complet, prêt à copier. Garde warnings vide sauf ambiguïté critique.",
  ].join("\n");

  const userPrompt = [
    "Demande à reformuler :",
    "```",
    request.input,
    "```",
    request.language ? `Langue attendue : ${request.language}` : "",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

function compactProfileGuidance(profile: PromptProfile): string {
  switch (profile.id) {
    case "web-design":
      return "Profil web-design : précise l'objectif et la référence visuelle présentes dans l'entrée. Pour une landing page/interface, demande de respecter les conventions, composants et styles existants ; n'invente pas de sections, contenus, palette ou responsive non demandés. Si l'entrée mentionne des conventions sans précision, formule-les comme conventions existantes du projet.";
    case "frontend":
      return "Profil frontend : précise uniquement le comportement, les composants, contraintes et validations présents dans l'entrée. N'ajoute pas d'états UI, responsive, accessibilité ou animations non demandés.";
    case "code":
      return "Profil code : précise objectif, fichiers ou zones concernées, comportement attendu, contraintes, tests et validation.";
    case "debug":
      return "Profil debug : précise symptôme, contexte, reproduction, hypothèses à vérifier, logs utiles et critères de résolution.";
    case "review":
      return "Profil review : demande une revue orientée risques, bugs, régressions, sécurité, performance et tests manquants.";
    case "writing":
      return "Profil rédaction : préserve le ton, l'objectif, le public, les contraintes de longueur et les informations à ne pas modifier.";
    default:
      return `Profil ${profile.id} : applique les consignes du profil sans élargir artificiellement le périmètre.`;
  }
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
