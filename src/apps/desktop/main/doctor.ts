import process from "node:process";
import { loadConfig, configPath as defaultConfigPath } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import type { ProviderAdapter } from "@/core/types.js";
import { hydrateCredentials } from "@/auth/credentials.js";
import { createProvider } from "@/providers/registry.js";
import { listProviderDefinitions, type BuiltinProvider } from "@/providers/catalog.js";
import type {
  DoctorCheck,
  DoctorReport,
  ShortcutIntent,
  ShortcutStateInfo,
} from "@/apps/desktop/shared/ipc-contract.js";
import type { PermissionsReport } from "./permissions.js";
import { t } from "./i18n.js";

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
  permissions?: PermissionsReport;
  shortcuts?: ShortcutStateInfo;
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
    dependencies.providerIds ??
    listProviderDefinitions()
      .filter((definition) => !definition.isTest)
      .map((definition) => definition.id);
  for (const id of ids) {
    checks.push(await checkProvider(id, env, config, create));
  }

  if (dependencies.permissions) {
    checks.push(...checkPermissions(dependencies.permissions));
  }

  if (dependencies.shortcuts) {
    checks.push(...checkShortcuts(dependencies.shortcuts));
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
      detail:
        health.missingConfiguration?.join(", ") ?? health.code ?? t("main.doctorConfigIncomplete"),
    };
  } catch {
    return { id: `provider:${id}`, ok: false, detail: t("main.doctorValidationError") };
  }
}

function checkPermissions(report: PermissionsReport): DoctorCheck[] {
  return [
    {
      id: "permissions:accessibility",
      ok: report.accessibility,
      detail: report.accessibility ? t("main.doctorPermissionGranted") : report.message,
    },
    {
      id: "permissions:automation",
      ok: report.automation,
      detail: report.automation ? t("main.doctorPermissionGranted") : report.message,
    },
    {
      id: "permissions:replace",
      ok: report.canReplace,
      detail: report.message,
    },
  ];
}

function checkShortcuts(state: ShortcutStateInfo): DoctorCheck[] {
  const checks: DoctorCheck[] = [
    checkShortcutIntent(state, "capture"),
    checkShortcutIntent(state, "input"),
    checkShortcutIntent(state, "popover"),
  ];

  checks.push({
    id: "shortcuts:rejected",
    ok: state.rejected.length === 0,
    detail:
      state.rejected.length === 0
        ? t("main.doctorNoRejection")
        : t("main.doctorRejectedBySystem", { list: state.rejected.join(", ") }),
  });

  // Séparé du refus système : ici personne d'autre ne tient la combinaison,
  // c'est Reqraft qui l'a demandée deux fois. Envoyer vers les Réglages système
  // pour la libérer ne mènerait nulle part.
  checks.push({
    id: "shortcuts:conflicts",
    ok: state.conflicts.length === 0,
    detail:
      state.conflicts.length === 0
        ? t("main.doctorNoConflict")
        : t("main.doctorConflictingShortcuts", { list: state.conflicts.join(", ") }),
  });

  return checks;
}

function checkShortcutIntent(state: ShortcutStateInfo, intent: ShortcutIntent): DoctorCheck {
  const active = state.registered.find((entry) => entry.intent === intent);
  return {
    id: `shortcuts:${intent}`,
    ok: active !== undefined,
    detail: active ? `${active.label} (${active.accelerator})` : t("main.doctorNoShortcut"),
  };
}
