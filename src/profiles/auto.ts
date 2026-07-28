const TECH_KEYWORDS: Record<string, string[]> = {
  frontend: [
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
  ],
  "web-design": [
    "design",
    "landing",
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
  ],
  debug: [
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
  ],
  review: ["review", "audit", "revue", "refactor", "refactoring", "code review", "qualité"],
  code: [
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
  ],
};

export function detectProfile(input: string): { profile: string; scores: Record<string, number> } {
  const lower = input.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [profile, keywords] of Object.entries(TECH_KEYWORDS)) {
    scores[profile] = keywords.reduce((sum, keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "g");
      const matches = lower.match(regex);
      return sum + (matches?.length ?? 0);
    }, 0);
  }

  // Code blocks give a small boost to code-related profiles.
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
