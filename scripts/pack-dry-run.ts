import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function npmPackCommand(platform: NodeJS.Platform = process.platform): {
  command: string;
  args: string[];
} {
  const args = ["pack", "--dry-run", "--ignore-scripts"];
  if (platform !== "win32") return { command: "npm", args };

  // Since Node's CVE-2024-27980 hardening, Windows batch shims cannot be
  // spawned directly. Use the command processor explicitly instead of
  // `shell: true`, which Node 24 deprecates when arguments are also passed.
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`],
  };
}

export function main(): void {
  const { command, args } = npmPackCommand();
  const env = { ...process.env };
  // pnpm injects this npm_config key when it launches scripts; npm does not own
  // it and warns about it. The dry-run has no dependency installation step.
  delete env.npm_config_verify_deps_before_run;
  env.npm_config_cache = path.join(tmpdir(), "reqraft-npm-cache");

  const result = spawnSync(command, args, {
    encoding: "utf8",
    env,
    stdio: "inherit",
  });

  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed with status ${String(result.status)}.`);
  }
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  main();
}
