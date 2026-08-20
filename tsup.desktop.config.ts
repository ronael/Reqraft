import { defineConfig } from "tsup";

/**
 * Desktop build — deliberately separate from the CLI bundle (DESKTOP.md,
 * lot 6: "deux configurations TypeScript et deux builds"). The CLI stays the
 * ESM tsup bundle of `tsup.config.ts`; here the Electron main process ships
 * as ESM (`.mjs`) and the sandboxed preload as a single CJS file (`.cjs`),
 * which is the only format a `sandbox: true` preload accepts.
 *
 * `electron` stays external: it is provided by the runtime. Everything else is
 * bundled in, and that is not the default: tsup externalises every entry of
 * `dependencies`, so a bare `import ... from "zod"` survived into the shipped
 * main process while `files: ["!node_modules/**"]` kept the package out of the
 * asar — the app died at startup with ERR_MODULE_NOT_FOUND. `noExternal`
 * inverts that default, so any dependency the main process reaches for is
 * bundled rather than assumed present. Node builtins stay external on their
 * own because the platform is `node`.
 *
 * Output lives under `release/`, never under `dist/`: `dist/` is what the npm
 * package publishes (`files: ["dist"]`), and nothing Electron belongs in
 * `@reqraft/cli`. Keeping the two trees physically apart makes that leak
 * impossible by construction rather than by a cleanup step.
 *
 * The internal `main/` `preload/` `renderer/` layout is load-bearing: the main
 * process resolves its siblings relatively (`path.join(mainDir, "../renderer")`),
 * so the tree can move as a whole but must not be rearranged internally.
 */
export default defineConfig([
  {
    entry: { "main/index": "src/apps/desktop/main/index.ts" },
    outDir: "release/desktop/bundle",
    format: ["esm"],
    target: "es2022",
    platform: "node",
    bundle: true,
    external: ["electron"],
    // Anything but `electron` itself: a bare `/.*/` here outranks `external`
    // and bundled a CommonJS shim for electron, which the runtime must provide.
    noExternal: [/^(?!electron$).*/],
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    outExtension: () => ({ js: ".mjs" }),
  },
  {
    entry: { "preload/index": "src/apps/desktop/preload/index.ts" },
    outDir: "release/desktop/bundle",
    format: ["cjs"],
    target: "es2022",
    platform: "node",
    bundle: true,
    external: ["electron"],
    // Anything but `electron` itself: a bare `/.*/` here outranks `external`
    // and bundled a CommonJS shim for electron, which the runtime must provide.
    noExternal: [/^(?!electron$).*/],
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: false,
    outExtension: () => ({ js: ".cjs" }),
  },
]);
