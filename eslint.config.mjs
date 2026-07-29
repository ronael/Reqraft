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
    ignores: ["dist", "node_modules", "*.config.*", "coverage"],
  }
);
