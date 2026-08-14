import { defineConfig } from "tsup";

/**
 * Desktop build — deliberately separate from the CLI bundle (DESKTOP.md,
 * lot 6: "deux configurations TypeScript et deux builds"). The CLI stays the
 * ESM tsup bundle of `tsup.config.ts`; here the Electron main process ships
 * as ESM (`.mjs`) and the sandboxed preload as a single CJS file (`.cjs`),
 * which is the only format a `sandbox: true` preload accepts.
 *
 * `electron` stays external: it is provided by the runtime.
 */
export default defineConfig([
  {
    entry: { "main/index": "src/desktop/main/index.ts" },
    outDir: "dist/desktop",
    format: ["esm"],
    target: "es2022",
    platform: "node",
    bundle: true,
    external: ["electron"],
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    outExtension: () => ({ js: ".mjs" }),
  },
  {
    entry: { "preload/index": "src/desktop/preload/index.ts" },
    outDir: "dist/desktop",
    format: ["cjs"],
    target: "es2022",
    platform: "node",
    bundle: true,
    external: ["electron"],
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: false,
    outExtension: () => ({ js: ".cjs" }),
  },
]);
