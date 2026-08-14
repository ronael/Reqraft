import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Renderer build for the desktop app. The output is loaded through `file://`
 * by the main process, hence the relative base. The CSP in
 * `src/desktop/renderer/index.html` only allows self-hosted assets, so
 * everything is bundled — no remote code ever reaches the renderer.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./src/desktop/renderer", import.meta.url)),
  base: "./",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/desktop/renderer", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});
