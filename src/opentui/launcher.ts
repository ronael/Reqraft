import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runOpenTuiAppLauncher(): number {
  const entry = resolveStandaloneEntry();
  if (!entry) {
    throw new Error("Entrée OpenTUI introuvable. Lance `pnpm build` puis réessaie.");
  }
  const bun = resolveBunBinary();
  if (!bun) {
    throw new Error(
      'Le mode interactif OpenTUI requiert Bun. Installe Bun ou utilise `rp "ton prompt"` en mode commande.',
    );
  }

  const result = spawnSync(bun, [entry], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function resolveStandaloneEntry(): string | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(currentDir, "standalone.js"),
    path.join(currentDir, "opentui", "standalone.js"),
    path.join(currentDir, "standalone.tsx"),
    path.join(currentDir, "opentui", "standalone.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveBunBinary(): string | null {
  const candidates = ["/opt/homebrew/bin/bun", "/usr/local/bin/bun", "/usr/bin/bun", "/bin/bun"];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
