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
    "Consignes adaptées au niveau :",
    levelAwareProfileGuidance(request.profile, request.level),
    "",
    levelDescription,
    "",
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
    levelAwareProfileGuidance(request.profile, request.level),
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

function levelAwareProfileGuidance(profile: PromptProfile, level: RepromptRequest["level"]): string {
  if (level === "minimal") {
    return `Le niveau minimal est prioritaire sur le profil ${profile.id}. Conserve uniquement l'action et les termes explicitement présents ; ne crée ni rubriques, ni checklist, ni critères supplémentaires.`;
  }

  switch (profile.id) {
    case "web-design":
      return "Profil web-design : précise l'objectif et la référence visuelle présentes dans l'entrée. Pour une landing page/interface, demande de respecter les conventions, composants et styles existants ; n'invente pas de sections, contenus, palette ou responsive non demandés. Si l'entrée mentionne des conventions sans précision, formule-les comme conventions existantes du projet.";
    case "frontend":
      return "Profil frontend : préserve le framework, les composants, contraintes et validations présents dans l'entrée. Pour une correction de page ou de composant sans symptôme précis, demande de corriger le problème en respectant l'implémentation existante. Ne invente pas de structure du code, champs ou validations ; n'ajoute pas d'états UI, responsive, accessibilité ou animations non demandés.";
    case "code":
      return "Profil code : préserver les termes techniques, fichiers, commandes et identifiants fournis ; préciser uniquement l'objectif, les zones, le comportement, les contraintes, les tests et la validation explicitement mentionnés ; ne jamais inventer.";
    case "debug":
      return "Profil debug : reformule le symptôme et la correction demandée. N'exige pas automatiquement logs, appareils, navigateurs, versions, reproduction ou cause racine ; ne les mentionne que s'ils sont fournis ou indispensables à l'ambiguïté signalée.";
    case "review":
      return "Profil review : conserve exactement le ou les axes d'audit demandés. N'ajoute pas sécurité, performance, tests, refactorisation ou autres axes si l'entrée se concentre sur les régressions.";
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
