import type { RepromptRequest } from "./types.js";
import type { PromptProfile } from "../profiles/types.js";
import { BASE_SYSTEM_PROMPT } from "../profiles/base.js";
import { BUILTIN_PROFILES } from "../profiles/registry.js";
import { describeLevel } from "./levels.js";

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface PromptBuildInput {
  input: string;
  profile: PromptProfile;
  level: RepromptRequest["level"];
  outputLanguage?: string;
  includeChanges: boolean;
}

export interface AutoDetectPromptInput {
  input: string;
  level: RepromptRequest["level"];
  outputLanguage?: string;
  includeChanges: boolean;
}

/**
 * The `auto` profile, in one call.
 *
 * No profile is resolved ahead of this call — the model chooses one itself,
 * from the same request that produces the rewrite, and reports its choice in
 * the `profile` field of its JSON response (read back by
 * `core/result-parser.ts#resolveDetectedProfileId`). No second generation
 * call, no second network round-trip.
 *
 * That said, this is not free: the system prompt carries one condensed,
 * level-aware guidance line per built-in profile (`levelAwareProfileGuidance`
 * below — the same short line `buildPrompt` uses for a single known profile,
 * not the long `PromptProfile.instructions` block, which nothing in this file
 * reads), so whichever profile gets picked, its guidance is already in
 * context. That is more input tokens than the explicit-profile prompt sends,
 * proportional to the number of built-in profiles — see
 * `benchmark/auto-profile-runner.ts` for a measured comparison, not a guess.
 */
export function buildAutoDetectPrompt(request: AutoDetectPromptInput): BuiltPrompt {
  const levelDescription = describeLevel(request.level);
  const menu = BUILTIN_PROFILES.map(
    (profile) => `- ${profile.id} (${profile.name}) : ${profile.description}`,
  ).join("\n");
  const guidance =
    request.level === "minimal"
      ? "Le niveau minimal est prioritaire sur le profil retenu, quel qu'il soit : conserve uniquement l'action et les termes explicitement présents ; ne crée ni rubriques, ni checklist, ni critères supplémentaires."
      : BUILTIN_PROFILES.map(
          (profile) => `${profile.id} : ${levelAwareProfileGuidance(profile, request.level)}`,
        ).join("\n");

  const systemPrompt = [
    "Tu es un assistant de reprompting. Tu reformules des demandes brutes en prompts clairs, fidèles et directement exploitables par une IA.",
    "",
    "Règles communes :",
    BASE_SYSTEM_PROMPT,
    "",
    "Aucun profil n'a été précisé. Détermine d'abord, à partir du seul contenu de la demande, quel profil ci-dessous lui correspond le mieux, puis applique ses consignes. N'annonce jamais ce choix dans le texte reformulé : indique-le uniquement dans le champ profile de la réponse. Si la demande ne correspond clairement à aucun profil, choisis clean.",
    "",
    "Profils disponibles :",
    menu,
    "",
    "Consignes par profil, adaptées au niveau demandé :",
    guidance,
    "",
    levelDescription,
    "",
    "Contraintes de sortie :",
    "- Le champ rewritten doit contenir uniquement le prompt final complet, prêt à copier.",
    `- Le champ profile doit contenir exactement l'un de ces identifiants : ${BUILTIN_PROFILES.map((profile) => profile.id).join(", ")}.`,
    "- Garde warnings vide sauf ambiguïté critique.",
    "- N'ajoute pas d'analyse, de justification, de résumé ou de variantes hors du champ rewritten.",
    "- Reste concis : chaque token généré doit aider l'utilisateur.",
    "",
    request.includeChanges
      ? "Réponds au format JSON strict avec les champs : rewritten (string), profile (string), changes (string[]), warnings (string[])."
      : "Réponds au format JSON strict avec les champs : rewritten (string), profile (string), warnings (string[]).",
    "Ne mets pas de Markdown autour du JSON.",
  ].join("\n");

  const userPrompt = [
    "Reformule la demande suivante :",
    "",
    "```",
    request.input,
    "```",
    request.outputLanguage ? `\nLangue attendue : ${request.outputLanguage}` : "",
  ].join("\n");

  return { systemPrompt, userPrompt };
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
    request.outputLanguage ? `\nLangue attendue : ${request.outputLanguage}` : "",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

function buildCompactStandardPrompt(request: PromptBuildInput): BuiltPrompt {
  const systemPrompt = [
    "Tu es un assistant de reprompting. Transforme une demande brute en prompt clair, fidèle et directement exploitable par une IA.",
    "Règles : conserve l'intention, la langue, les termes techniques et les contraintes ; n'invente pas de contexte, de marque, de sections, de fonctionnalités, de fichiers ni de décisions.",
    "Niveau standard : corrige, clarifie et structure légèrement ; ne te limite pas à corriger la grammaire si la demande implique création, implémentation ou conception ; produis un brief actionnable sans élargir le périmètre.",
    "N'ajoute pas de sections, CTA, témoignages, palettes, contraintes responsive ou critères de validation absents de l'entrée. Demande plutôt de vérifier l'existant.",
    "Une demande courte doit rester concise, sauf si l’action demandée nécessite naturellement un résultat développé.",
    levelAwareProfileGuidance(request.profile, request.level),
    "Sortie : JSON strict uniquement avec rewritten (string) et warnings (string[]). Le champ rewritten doit contenir uniquement le prompt final complet, prêt à copier. Garde warnings vide sauf ambiguïté critique.",
  ].join("\n");

  const userPrompt = [
    "Demande à reformuler :",
    "```",
    request.input,
    "```",
    request.outputLanguage ? `Langue attendue : ${request.outputLanguage}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

/**
 * Shared by `buildPrompt` (one known profile) and `buildAutoDetectPrompt`
 * (once per built-in profile, so whichever one the model picks has its
 * guidance on hand) — a single source for what "apply profile X at level Y"
 * means. Deliberately a short, hand-written line per profile, not
 * `PromptProfile.instructions` (the longer block used by custom profile
 * parsing in `profiles/custom.ts`) — sending every profile's full
 * instructions in `buildAutoDetectPrompt` would multiply the system prompt's
 * size for comparatively little gained precision; this stays compact.
 */
export function levelAwareProfileGuidance(
  profile: PromptProfile,
  level: RepromptRequest["level"],
): string {
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
