import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.tsx", "src/opentui/standalone.tsx"],
  outDir: "dist",
  format: ["esm"],
  target: "es2022",
  platform: "node",
  bundle: true,
  external: ["react"],
  noExternal: ["@opentui/core", "@opentui/react", "react-reconciler"],
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: false,
  shims: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __reqraftCreateRequire } from "node:module";',
      "const require = __reqraftCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
