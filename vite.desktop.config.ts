import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Renderer build for the desktop app. The output is loaded through `file://`
 * by the main process, hence the relative base. The CSP in
 * `src/desktop/renderer/index.html` only allows self-hosted assets, so
 * everything is bundled — no remote code ever reaches the renderer.
 *
 * Output sits beside the main/preload bundles under `release/desktop/bundle`,
 * outside the `dist/` tree the npm package publishes. See
 * `tsup.desktop.config.ts` for why the split is structural.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./src/desktop/renderer", import.meta.url)),
  // Vite does not read `tsconfig.paths`; `@/…` must resolve here too, and the
  // renderer root is not the project root, so the alias is spelled absolutely.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  base: "./",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./release/desktop/bundle/renderer", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});
