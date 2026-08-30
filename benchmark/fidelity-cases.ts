import type { RepromptLevel } from "@/core/types.js";

export interface FidelityBenchmarkCase {
  id: string;
  input: string;
  profile: string;
  level: RepromptLevel;
  forbiddenAdditions: string[];
  mustPreserve?: string[];
}

export const FIDELITY_BENCHMARK_CASES: FidelityBenchmarkCase[] = [
  {
    id: "web-design-landing-apple-standard",
    input: "fais une landing page style apple",
    profile: "web-design",
    level: "standard",
    forbiddenAdditions: [
      "témoignages",
      "pricing",
      "FAQ",
      "authentification",
      "base de données",
      "footer",
    ],
    mustPreserve: ["landing page", "apple"],
  },
  {
    id: "web-design-landing-apple-complete",
    input: "fais une landing page style apple",
    profile: "web-design",
    level: "complete",
    forbiddenAdditions: ["témoignages", "pricing", "FAQ", "authentification", "base de données"],
    mustPreserve: ["landing page", "apple"],
  },
  {
    id: "frontend-red-button",
    input: "ajoute un bouton rouge",
    profile: "frontend",
    level: "standard",
    forbiddenAdditions: ["authentification", "base de données", "FAQ", "pricing", "animations"],
    mustPreserve: ["bouton", "rouge"],
  },
  {
    id: "frontend-login-page",
    input: "corrige la page login",
    profile: "frontend",
    level: "standard",
    forbiddenAdditions: [
      "inscription",
      "authentification à deux facteurs",
      "base de données",
      "pricing",
    ],
    mustPreserve: ["login"],
  },
  {
    id: "frontend-card",
    input: "améliore cette card",
    profile: "frontend",
    level: "standard",
    forbiddenAdditions: ["témoignages", "pricing", "FAQ", "authentification", "base de données"],
    mustPreserve: ["card"],
  },
  {
    id: "frontend-responsive-form",
    input: "mets le formulaire en responsive",
    profile: "frontend",
    level: "standard",
    forbiddenAdditions: ["authentification", "base de données", "paiement", "pricing"],
    mustPreserve: ["formulaire", "responsive"],
  },
  {
    id: "web-design-hero-text",
    input: "change le texte du hero",
    profile: "web-design",
    level: "standard",
    forbiddenAdditions: ["nouvelle section", "témoignages", "pricing", "FAQ"],
    mustPreserve: ["texte", "hero"],
  },
  {
    id: "clean-short",
    input: "corrige cette phrase stp",
    profile: "clean",
    level: "minimal",
    forbiddenAdditions: ["fonctionnalité", "section", "base de données"],
  },
  {
    id: "clean-email",
    input: "rend ce message plus poli",
    profile: "clean",
    level: "standard",
    forbiddenAdditions: ["pièce jointe", "calendrier", "réunion"],
  },
  {
    id: "writing-email",
    input: "écris un mail court pour relancer le devis",
    profile: "writing",
    level: "standard",
    forbiddenAdditions: ["remise", "contrat", "rendez-vous obligatoire"],
    mustPreserve: ["mail", "devis"],
  },
  {
    id: "writing-linkedin",
    input: "améliore ce post linkedin sans changer le ton",
    profile: "writing",
    level: "standard",
    forbiddenAdditions: ["hashtags", "call to action", "offre commerciale"],
    mustPreserve: ["linkedin", "ton"],
  },
  {
    id: "code-test",
    input: "ajoute un test pour parseResult",
    profile: "code",
    level: "standard",
    forbiddenAdditions: ["refactor complet", "migration", "base de données"],
    mustPreserve: ["test", "parseResult"],
  },
  {
    id: "code-endpoint",
    input: "crée un endpoint GET /health",
    profile: "code",
    level: "standard",
    forbiddenAdditions: ["authentification", "base de données", "cache"],
    mustPreserve: ["GET", "/health"],
  },
  {
    id: "code-refactor",
    input: "refactor ce helper sans changer le comportement",
    profile: "code",
    level: "complete",
    forbiddenAdditions: ["nouvelle fonctionnalité", "API", "base de données"],
    mustPreserve: ["helper", "sans changer le comportement"],
  },
  {
    id: "debug-500",
    input: "j'ai une erreur 500 sur la route /api/users",
    profile: "debug",
    level: "standard",
    forbiddenAdditions: ["nouvelle route", "authentification", "UI"],
    mustPreserve: ["500", "/api/users"],
  },
  {
    id: "debug-timeout",
    input: "ça timeout quand je lance pnpm build",
    profile: "debug",
    level: "standard",
    forbiddenAdditions: ["migration", "réécriture complète", "base de données"],
    mustPreserve: ["timeout", "pnpm build"],
  },
  {
    id: "review-pr",
    input: "review cette PR surtout les régressions possibles",
    profile: "review",
    level: "standard",
    forbiddenAdditions: ["implémentation", "nouvelle fonctionnalité", "refactor obligatoire"],
    mustPreserve: ["PR", "régressions"],
  },
  {
    id: "review-security",
    input: "audit sécurité de ce middleware",
    profile: "review",
    level: "complete",
    forbiddenAdditions: ["réécrire", "nouveau provider", "base de données"],
    mustPreserve: ["sécurité", "middleware"],
  },
  {
    id: "web-design-logo",
    input: "garde le logo mais modernise le hero",
    profile: "web-design",
    level: "standard",
    forbiddenAdditions: ["changer le logo", "pricing", "témoignages"],
    mustPreserve: ["logo", "hero"],
  },
  {
    id: "web-design-palette",
    input: "change la palette en bleu et blanc",
    profile: "web-design",
    level: "standard",
    forbiddenAdditions: ["nouvelle typographie", "témoignages", "FAQ"],
    mustPreserve: ["bleu", "blanc"],
  },
  // Cas de régression spécifiques écrits à la main, un par tentation identifiée.
  //
  // Ils remplacent dix-huit cas générés à partir de cinq entrées répétées sur
  // trois niveaux : ils remplissaient un seuil de comptage sans rien couvrir de
  // plus que ces cinq phrases. Chaque cas ci-dessous nomme ce qu'un modèle a
  // envie d'ajouter à cette demande-là.

  // clean — la correction ne doit rien reformuler d'autre.
  {
    id: "clean-typo-only",
    input: "corrige les fautes dans ce paragraphe, ne change rien d'autre",
    profile: "clean",
    level: "minimal",
    forbiddenAdditions: ["restructure", "plan", "titre", "sections"],
    mustPreserve: ["fautes", "paragraphe"],
  },
  {
    id: "clean-keep-tone",
    input: "relis ce message, garde le ton familier",
    profile: "clean",
    level: "standard",
    forbiddenAdditions: ["formel", "professionnel", "vouvoiement"],
    mustPreserve: ["ton", "familier"],
  },
  {
    id: "clean-no-length-change",
    input: "corrige l'orthographe de ce tweet, il doit rester court",
    profile: "clean",
    level: "minimal",
    forbiddenAdditions: ["hashtags", "emoji", "call to action"],
    mustPreserve: ["orthographe", "court"],
  },

  // debug — la demande décrit un symptôme, pas une cause.
  {
    id: "debug-symptom-not-cause",
    input: "l'appli plante au démarrage depuis hier",
    profile: "debug",
    level: "standard",
    // Le piège : proposer une cause inventée, ou un fichier qu'on n'a pas vu.
    forbiddenAdditions: ["migration", "dépendance corrompue", "cache", "base de données"],
    mustPreserve: ["démarrage"],
  },
  {
    id: "debug-no-invented-path",
    input: "le login échoue une fois sur deux, trouve pourquoi",
    profile: "debug",
    level: "standard",
    forbiddenAdditions: ["authentification à deux facteurs", "rate limiting"],
    mustPreserve: ["login"],
  },
  {
    id: "debug-no-invented-command",
    input: "les tests passent en local mais pas en CI",
    profile: "debug",
    level: "complete",
    forbiddenAdditions: ["docker", "cache npm", "variables d'environnement manquantes"],
    mustPreserve: ["tests", "CI"],
  },

  // writing — un message court ne devient pas une note de service.
  {
    id: "writing-short-stays-short",
    input: "dis à Paul que je serai en retard de dix minutes",
    profile: "writing",
    level: "minimal",
    forbiddenAdditions: ["excuses", "explication", "réunion", "ordre du jour"],
    mustPreserve: ["Paul", "retard"],
  },
  {
    id: "writing-no-invented-facts",
    input: "écris un mail pour décaler le point de lundi",
    profile: "writing",
    level: "standard",
    // Le piège : inventer une raison, une nouvelle date, des participants.
    forbiddenAdditions: ["imprévu", "urgence", "mardi", "visioconférence"],
    mustPreserve: ["lundi"],
  },
  {
    id: "writing-keep-language",
    input: "reformule ce message en gardant le français",
    profile: "writing",
    level: "standard",
    forbiddenAdditions: ["english", "translation"],
    mustPreserve: ["français"],
  },

  // review — la revue porte sur ce qui est demandé, pas sur tout le dépôt.
  {
    id: "review-scope-stays-narrow",
    input: "relis cette fonction, juste la lisibilité",
    profile: "review",
    level: "standard",
    forbiddenAdditions: ["performance", "sécurité", "tests", "architecture"],
    mustPreserve: ["lisibilité"],
  },
  {
    id: "review-no-invented-checklist",
    input: "regarde si ce patch casse quelque chose",
    profile: "review",
    level: "minimal",
    forbiddenAdditions: ["couverture de tests", "documentation", "changelog"],
    mustPreserve: ["patch"],
  },

  // code — une demande de correction n'est pas une demande de réécriture.
  {
    id: "code-no-new-dependency",
    input: "simplifie cette boucle",
    profile: "code",
    level: "standard",
    forbiddenAdditions: ["lodash", "bibliothèque", "dépendance", "framework"],
    mustPreserve: ["boucle"],
  },
  {
    id: "code-no-invented-file",
    input: "extrais cette logique dans une fonction à part",
    profile: "code",
    level: "standard",
    // Le piège le plus courant : nommer un fichier que personne n'a mentionné.
    forbiddenAdditions: ["tests unitaires", "documentation", "interface"],
    mustPreserve: ["fonction"],
  },
  {
    id: "code-keep-behaviour",
    input: "réécris ça en async sans changer ce que ça fait",
    profile: "code",
    level: "complete",
    forbiddenAdditions: ["nouvelle API", "gestion d'erreurs supplémentaire", "logs"],
    mustPreserve: ["async", "comportement"],
  },

  // frontend — une correction visuelle reste une correction visuelle.
  {
    id: "frontend-padding-only",
    input: "corrige le padding de la carte, rien d'autre",
    profile: "frontend",
    level: "minimal",
    forbiddenAdditions: ["responsive", "animations", "palette", "accessibilité"],
    mustPreserve: ["padding", "carte"],
  },
  {
    id: "frontend-rename-only",
    input: "renomme ce bouton en « Enregistrer »",
    profile: "frontend",
    level: "minimal",
    forbiddenAdditions: ["confirmation", "modale", "toast", "raccourci"],
    mustPreserve: ["Enregistrer"],
  },
  {
    id: "frontend-mobile-bug",
    input: "le menu déborde sur mobile",
    profile: "frontend",
    level: "standard",
    forbiddenAdditions: ["refonte", "design system", "tablette", "desktop"],
    mustPreserve: ["menu", "mobile"],
  },

  // web-design — la demande donne une direction, pas un cahier des charges.
  {
    id: "web-design-hero-only",
    input: "refais juste le bloc du haut",
    profile: "web-design",
    level: "standard",
    forbiddenAdditions: ["footer", "pricing", "témoignages", "FAQ", "SEO"],
    mustPreserve: ["bloc"],
  },
  {
    id: "web-design-color-direction",
    input: "rends la page plus sobre",
    profile: "web-design",
    level: "standard",
    forbiddenAdditions: ["animations", "vidéo", "carrousel", "authentification"],
    mustPreserve: ["sobre"],
  },
  {
    id: "web-design-single-section",
    input: "ajoute une section contact en bas",
    profile: "web-design",
    level: "minimal",
    forbiddenAdditions: ["base de données", "envoi d'e-mail", "captcha", "RGPD"],
    mustPreserve: ["contact"],
  },
  {
    id: "code-refactore-typo",
    input: "refactore ce helper sans changer le comportement",
    profile: "code",
    level: "standard",
    forbiddenAdditions: ["nouvelle fonctionnalité", "API", "base de données"],
    mustPreserve: ["helper", "comportement"],
  },
  {
    id: "review-pr-pull-request-equivalence",
    input: "review cette PR, cherche les régressions possibles",
    profile: "review",
    level: "standard",
    forbiddenAdditions: ["sécurité", "performance", "tests manquants", "refactor obligatoire"],
    mustPreserve: ["régressions"],
  },
];
