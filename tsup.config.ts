import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.tsx"],
  outDir: "dist",
  format: ["esm"],
  target: "es2022",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  shims: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
