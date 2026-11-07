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
    // `tests/tui` drives the real OpenTUI renderer, whose native FFI only
    // loads under Bun. Those run through `pnpm test:tui`, not here.
    exclude: ["tests/tui/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/apps/cli/cli.tsx",
        "src/version.ts",
        // The Electron main entry point and the preload bridge only run inside
        // Electron, which Vitest does not start. tests/e2e/desktop.test.ts
        // drives them in the real app, where no V8 coverage is collected.
        "src/apps/desktop/main/index.ts",
        "src/apps/desktop/preload/index.ts",
        // What the main process runs only when the e2e suite starts it
        // (DESKTOP_E2E_* variables): test instrumentation, not product code.
        "src/apps/desktop/main/e2e-*.ts",
      ],
    },
  },
});
