import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env };
// pnpm injects this npm_config key when it launches scripts; npm does not own
// it and warns about it. The dry-run has no dependency installation step.
delete env.npm_config_verify_deps_before_run;
env.npm_config_cache = path.join(tmpdir(), "reqraft-npm-cache");

const result = spawnSync(npmCommand, ["pack", "--dry-run", "--ignore-scripts"], {
  encoding: "utf8",
  env,
  stdio: "inherit",
});

if (result.error !== undefined) throw result.error;
if (result.status !== 0) {
  throw new Error(`npm pack --dry-run failed with status ${String(result.status)}.`);
}
