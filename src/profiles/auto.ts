interface KeywordRule {
  keywords: string[];
  weight: number;
}

const PROFILE_RULES: Record<string, KeywordRule[]> = {
  frontend: [
    {
      keywords: [
        "react",
        "vue",
        "svelte",
        "angular",
        "component",
        "composant",
        "css",
        "tailwind",
        "styled",
        "button",
        "bouton",
        "dashboard",
        "modal",
        "page",
        "card",
        "carte",
        "formulaire",
        "form",
        "responsive",
        "mobile",
        "frontend",
        "ui",
        "interface",
        "html",
        "dom",
        "event",
        "onClick",
        "useState",
        "useEffect",
      ],
      weight: 1,
    },
  ],
  "web-design": [
    {
      keywords: [
        "design",
        "landing",
        "landing page",
        "maquette",
        "mockup",
        "wireframe",
        "palette",
        "typography",
        "typographie",
        "layout",
        "hero",
        "section",
        "visuel",
        "visually",
        "brand",
        "marque",
        "couleur",
        "color",
        "font",
        "spacing",
        "spacing",
        "modern",
        "moderne",
        "style",
        "apple",
        "convention",
        "conventions",
      ],
      weight: 1,
    },
  ],
  debug: [
    {
      keywords: [
        "bug",
        "erreur",
        "error",
        "crash",
        "stack trace",
        "exception",
        "résoudre",
        "fix",
        "debug",
        "debugger",
        "ne marche pas",
        "does not work",
        "fails",
        "failed",
        "timeout",
        "500",
        "404",
      ],
      weight: 1,
    },
  ],
  review: [
    {
      keywords: [
        "review",
        "audit",
        "revue",
        "refactor",
        "refactoring",
        "code review",
        "qualité",
        "performance",
        "security",
        "sécurité",
        "best practice",
        "bonne pratique",
      ],
      weight: 1,
    },
  ],
  code: [
    {
      keywords: [
        "function",
        "fonction",
        "api",
        "endpoint",
        "route",
        "test",
        "tester",
        "typescript",
        "javascript",
        "python",
        "sql",
        "database",
        "backend",
        "server",
        "pnpm",
        "npm",
        "git",
        "docker",
        "ci",
        "cd",
        "refactor",
        "implémenter",
        "implement",
        "class",
        "module",
        "package",
      ],
      weight: 1,
    },
  ],
  writing: [
    {
      keywords: [
        "email",
        "e-mail",
        "mail",
        "message",
        "description",
        "document",
        "publication",
        "post",
        "rédiger",
        "write",
        "rédaction",
        "ton",
        "formuler",
      ],
      weight: 1,
    },
  ],
};

export function detectProfile(input: string): { profile: string; scores: Record<string, number> } {
  const lower = input.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [profile, rules] of Object.entries(PROFILE_RULES)) {
    scores[profile] = rules.reduce((profileScore, rule) => {
      const ruleScore = rule.keywords.reduce((sum, keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, "g");
        const matches = lower.match(regex);
        return sum + (matches?.length ?? 0) * rule.weight;
      }, 0);
      return profileScore + ruleScore;
    }, 0);
  }

  // Code blocks boost code-related profiles.
  const codeBlockMatches = lower.match(/```[a-z]*/g);
  if (codeBlockMatches && codeBlockMatches.length > 0) {
    scores.code = (scores.code ?? 0) + codeBlockMatches.length;
    scores.frontend = (scores.frontend ?? 0) + codeBlockMatches.length * 0.5;
    scores.debug = (scores.debug ?? 0) + codeBlockMatches.length * 0.3;
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const winner = entries[0];
  if (!winner || winner[1] === 0) {
    return { profile: "clean", scores };
  }

  // Tie or low confidence falls back to clean.
  const second = entries[1];
  if (second && second[1] > 0 && winner[1] - second[1] < 1) {
    return { profile: "clean", scores };
  }

  return { profile: winner[0], scores };
}

export function getProfileDetectionScores(input: string): Record<string, number> {
  return detectProfile(input).scores;
}
