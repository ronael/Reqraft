import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest resolves through Vite, which does not read `tsconfig.paths`. The
  // alias is declared here so `@/…` means the same thing in tests as it does
  // under tsc and tsup.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/apps/cli/cli.tsx", "src/version.ts"],
    },
  },
});
