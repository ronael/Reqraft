import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";

/**
 * SonarJS rules deliberately left off. Each one is justified in
 * docs/sonarqube.md; do not add an entry without adding the reasoning there.
 */
const TOLERATED_SONAR_RULES = new Set([
  "sonarjs/file-header",
  "sonarjs/arrow-function-convention",
  "sonarjs/shorthand-property-grouping",
  "sonarjs/no-reference-error",
  "sonarjs/max-union-size",
  "sonarjs/cyclomatic-complexity",
  "sonarjs/no-undefined-assignment",
]);

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  sonarjs.configs.recommended,
  {
    // `recommended` leaves 62 SonarJS rules off. Every one of them is enabled
    // here except the exceptions listed in docs/sonarqube.md, so a smell the
    // preset would tolerate still fails the build.
    rules: Object.fromEntries(
      Object.entries(sonarjs.configs.recommended.rules)
        .filter(([name, level]) => {
          const disabled = (Array.isArray(level) ? level[0] : level) === "off";
          return disabled && !TOLERATED_SONAR_RULES.has(name);
        })
        .map(([name]) => [name, "error"]),
    ),
  },
  {
    // Fixtures legitimately repeat literals; Sonar itself scopes this rule to
    // production code through sonar.tests in sonar-project.properties.
    files: ["tests/**", "benchmark/**"],
    rules: { "sonarjs/no-duplicate-string": "off" },
  },
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    // OpenTUI JSX uses terminal primitives (`box`, `text`, `scrollbox`) and
    // renderer props that the DOM-oriented React plugin cannot know about.
    files: ["src/apps/cli/opentui/**/*.tsx", "src/apps/cli/tui/**/*.tsx"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
  {
    // Le métier ne dépend jamais d'une application : la dépendance va toujours
    // de `src/apps/**` vers les modules racine, jamais l'inverse. Ce qu'une
    // app et le métier partagent vit dans `src/shared/`.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/apps/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps", "@/apps/**"],
              message:
                "Le code métier ne dépend jamais d'une application : déplacer le morceau partagé dans src/shared/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Les deux applications finales sont étanches : ni l'une ni l'autre
    // n'importe l'autre. Ce qui est réellement commun vit dans src/shared ou
    // dans un module métier (src/core, src/config…), jamais en travers.
    files: ["src/apps/cli/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps/desktop", "@/apps/desktop/**"],
              message: "Le CLI n'importe jamais l'application desktop.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/apps/desktop/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/apps/cli", "@/apps/cli/**"],
              message: "Le desktop n'importe jamais l'application CLI.",
            },
          ],
        },
      ],
    },
  },
  {
    // DESKTOP.md §4.2, règle 1 : le renderer ne parle jamais au cœur, tout
    // passe par l'IPC. Bloquant, types compris.
    files: ["src/apps/desktop/renderer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/core",
                "**/core/**",
                "**/providers",
                "**/providers/**",
                "**/auth",
                "**/auth/**",
                "**/application",
                "**/application/**",
              ],
              message:
                "Le renderer ne parle jamais au cœur : tout passe par l'IPC (DESKTOP.md §2.1 et §4.2).",
            },
            {
              group: ["@/apps/cli", "@/apps/cli/**"],
              message: "Le desktop n'importe jamais l'application CLI.",
            },
          ],
        },
      ],
    },
  },
  {
    // DESKTOP.md §4.2, règle 2 : les modules purs de src/apps/cli/ui (hors components/
    // et hooks/) restent réutilisables par la TUI comme par le desktop.
    files: ["src/apps/cli/ui/**/*.{ts,tsx}"],
    ignores: ["src/apps/cli/ui/components/**", "src/apps/cli/ui/hooks/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react-dom", "react-dom/**", "ink", "ink/**", "@opentui/*", "@opentui/**"],
              message:
                "Les modules purs de src/apps/cli/ui ne dépendent d'aucune surface de rendu (DESKTOP.md §4.2).",
            },
            {
              group: ["@/apps/desktop", "@/apps/desktop/**"],
              message: "Le CLI n'importe jamais l'application desktop.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist", "node_modules", "*.config.*", "coverage"],
  },
);
