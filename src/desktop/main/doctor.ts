import process from "node:process";
import { loadConfig, configPath as defaultConfigPath } from "../../config/loader.js";
import type { Config } from "../../config/schema.js";
import type { ProviderAdapter } from "../../core/types.js";
import { hydrateCredentials } from "../../auth/credentials.js";
import { createProvider } from "../../providers/registry.js";
import { listProviderDefinitions, type BuiltinProvider } from "../../providers/catalog.js";
import type { DoctorCheck, DoctorReport } from "../shared/ipc-contract.js";

/**
 * Structured doctor report for the settings Diagnostic tab (DESKTOP.md
 * lot 5). Same primitives as `commands/doctor.ts`, but the desktop contract
 * needs data, not printed lines — so the report is built here, not parsed.
 *
 * Every dependency is injectable: the report is testable without touching
 * providers, the keychain or the filesystem.
 */
export interface DoctorDependencies {
  loadConfig?: () => Promise<Config>;
  configPath?: () => string;
  hydrateCredentials?: (env: NodeJS.ProcessEnv) => Promise<void>;
  createProvider?: (
    id: BuiltinProvider,
    env: NodeJS.ProcessEnv,
    config?: Config,
  ) => ProviderAdapter;
  env?: NodeJS.ProcessEnv;
  providerIds?: readonly BuiltinProvider[];
}

export async function buildDoctorReport(
  dependencies: DoctorDependencies = {},
): Promise<DoctorReport> {
  const env = dependencies.env ?? process.env;
  const load = dependencies.loadConfig ?? loadConfig;
  const hydrate = dependencies.hydrateCredentials ?? hydrateCredentials;
  const create = dependencies.createProvider ?? createProvider;

  const checks: DoctorCheck[] = [];

  const config = await load();
  checks.push({
    id: "config:file",
    ok: true,
    detail: (dependencies.configPath ?? defaultConfigPath)(),
  });
  checks.push({
    id: "config:defaults",
    ok: true,
    detail: `${config.defaultProvider} · ${config.defaultModel} · ${config.defaultProfile}`,
  });

  await hydrate(env);

  const ids =
    dependencies.providerIds ?? listProviderDefinitions().map((definition) => definition.id);
  for (const id of ids) {
    checks.push(await checkProvider(id, env, config, create));
  }

  return { checks };
}

async function checkProvider(
  id: BuiltinProvider,
  env: NodeJS.ProcessEnv,
  config: Config,
  create: NonNullable<DoctorDependencies["createProvider"]>,
): Promise<DoctorCheck> {
  try {
    const provider = create(id, env, config);
    const health = await provider.validateConfiguration();
    if (health.ok) {
      return { id: `provider:${id}`, ok: true };
    }
    return {
      id: `provider:${id}`,
      ok: false,
      detail: health.missingConfiguration?.join(", ") ?? health.code ?? "configuration incomplète",
    };
  } catch {
    return { id: `provider:${id}`, ok: false, detail: "erreur de validation" };
  }
}
