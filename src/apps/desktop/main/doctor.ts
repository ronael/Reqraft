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

  checks.push({
    id: "shortcuts:suspended",
    ok: !state.suspended,
    detail: state.suspended ? t("main.doctorShortcutsSuspended") : t("main.doctorShortcutsActive"),
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

/**
 * Ce que le rapport copié peut dire de la machine, en plus des vérifications.
 *
 * Tout est optionnel et fourni par l'appelant : la fonction de formatage reste
 * pure, donc testable sans `process`, sans `os` et sans Electron.
 */
export interface DoctorReportContext {
  /** Version applicative, déjà disponible dans le main (`@/version.js`). */
  version?: string;
  /** `process.platform`, jamais l'identité de la machine. */
  platform?: string;
  /**
   * Le dossier personnel, uniquement pour le retirer du texte.
   *
   * Un rapport part dans une issue GitHub : `/Users/prenom.nom/...` y publie
   * un nom d'utilisateur que personne n'a l'intention de partager. Il est
   * remplacé par `~`, comme un shell l'écrit.
   */
  homeDir?: string;
}

/** Au-delà, un détail est tronqué : un rapport reste lisible dans une issue. */
const MAX_DETAIL_LENGTH = 200;

/**
 * Le rapport en texte brut, pour le presse-papiers (roadmap Diagnostic).
 *
 * Pure et sans traduction : ce texte est destiné à une issue publique, où une
 * sortie stable en anglais se compare d'une machine à l'autre, alors qu'un
 * rapport localisé ne se compare plus du tout. La sanitization est acquise par
 * construction — `DoctorCheck.detail` ne porte que des libellés du catalogue,
 * des identifiants de configuration et des noms de variables manquantes, et
 * jamais une valeur d'environnement ni un message d'exception (voir
 * `checkProvider`). Ce qui est fait ici est le dernier filet : le dossier
 * personnel disparaît, les caractères de contrôle aussi, et un détail
 * anormalement long est tronqué.
 */
export function formatDoctorReport(
  report: DoctorReport,
  context: DoctorReportContext = {},
): string {
  const lines = ["Reqraft diagnostic"];
  if (context.version !== undefined && context.version !== "") {
    lines.push(`version: ${context.version}`);
  }
  if (context.platform !== undefined && context.platform !== "") {
    lines.push(`platform: ${context.platform}`);
  }
  lines.push("");

  for (const check of report.checks) {
    const status = check.ok ? "ok" : "fail";
    const detail = sanitizeDetail(check.detail, context.homeDir);
    lines.push(
      detail === "" ? `- [${status}] ${check.id}` : `- [${status}] ${check.id}: ${detail}`,
    );
  }

  // Fin de ligne unique et saut final : le texte reste identique quelle que
  // soit la plateforme, et se colle proprement à la suite d'un paragraphe.
  return `${lines.join("\n")}\n`;
}

function sanitizeDetail(detail: string | undefined, homeDir: string | undefined): string {
  if (detail === undefined) return "";
  // Les caractères de contrôle d'abord : ils casseraient la liste à puces, et
  // un détail sur deux lignes ne se relit plus dans une issue.
  let value = detail.replaceAll(/[\p{Cc}\p{Cf}]/gu, " ");
  if (homeDir !== undefined && homeDir.length > 1) {
    value = value.split(homeDir).join("~");
  }
  value = value.replaceAll(/\s+/g, " ").trim();
  return value.length > MAX_DETAIL_LENGTH ? `${value.slice(0, MAX_DETAIL_LENGTH)}…` : value;
}
