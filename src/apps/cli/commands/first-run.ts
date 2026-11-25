import os from "node:os";
import process from "node:process";
import readline from "node:readline";
import { existsSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { ConfigSchema, type Config } from "@/config/schema.js";
import {
  buildApiKeyStatus,
  createInitConfig,
  type ApiKeyStatus,
  type CompatibleProviderInput,
  type InitConfigInput,
} from "@/config/setup.js";
import { configPath, loadUserConfig, saveConfig, DEFAULT_CONFIG } from "@/config/loader.js";
import { getPresetModels } from "@/models/presets.js";
import { createProvider } from "@/providers/registry.js";
import { hydrateCredentials } from "@/auth/credentials.js";
import { formatUiError } from "@/shared/errors.js";
import type { AnsiStyleOptions } from "@/apps/cli/ui/ansi.js";
import { detectCapabilities } from "@/shared/terminal/capabilities.js";
import {
  formatInitChoice,
  formatInitCommand,
  formatInitHeading,
  formatInitMetric,
  formatInitPrompt,
  formatInitQuestion,
  formatInitSection,
  formatInitStatus,
} from "@/apps/cli/ui/init-format.js";
import { DEFAULT_REPROMPT_LEVEL, REPROMPT_LEVELS } from "@/core/levels.js";
import { RequestTimeoutError } from "@/core/errors.js";
import { REPROMPT_POLICY } from "@/core/reprompt-policy.js";
import { recommendLocalModel } from "@/models/local-recommendation.js";
import { isTimeoutError } from "@/providers/http.js";
import {
  LOCAL_SERVERS,
  isLocalEndpoint,
  localServerKind,
  trimTrailingSlashes,
} from "@/providers/local-endpoint.js";
import {
  detectLocalServers,
  listInstalledModels,
  type DetectedLocalServer,
} from "@/providers/local-servers.js";
import { listProfiles } from "@/profiles/registry.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import {
  type CredentialProvider,
  type InitProvider,
  getProviderDefinition,
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "@/providers/catalog.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { modelDescription } from "@/apps/cli/presentation/catalog-labels.js";
import type { UiLocalePreference } from "@/i18n/locale.js";

interface InitProviderChoice {
  label: string;
  provider: InitProvider;
  local?: boolean;
}

interface RunFirstRunOptions {
  reset?: boolean;
  input?: Readable;
  output?: Writable;
  env?: NodeJS.ProcessEnv;
  shell?: string;
  /** The machine's memory, which decides the local model recommended. */
  totalMemoryBytes?: number;
}

// Re-exported: `rp init` is the CLI face of a rule that now lives in the
// shared configuration module, so the desktop can apply the same one.
export { buildApiKeyStatus, createInitConfig };
export type { ApiKeyStatus, CompatibleProviderInput, InitConfigInput };

const DEFAULT_TRANSLATOR = createTranslator("fr");

export function getInitProfileChoices(): string[] {
  return [AUTO_PROFILE_ID, ...listProfiles().map((profile) => profile.id)];
}

export function getInitProviderChoices(t: Translator = DEFAULT_TRANSLATOR): InitProviderChoice[] {
  const choices = listProviderDefinitions()
    .filter((definition) => definition.visibleInInit)
    .map((definition) => ({
      label: definition.label,
      provider: definition.id as InitProvider,
    }));

  return [
    ...choices,
    {
      label: t("init.localProvider"),
      provider: OPENAI_COMPATIBLE_PROVIDER_ID,
      local: true,
    },
  ];
}

function formatApiKeyStatus(status: ApiKeyStatus, t: Translator): string {
  if (!status.envName) return t("init.keyNotRequired");
  return status.detected
    ? t("init.keyDetected", { envName: status.envName })
    : t("init.keyNotDetected", { envName: status.envName });
}

export function buildShellInstructions(
  envName: string,
  shell = process.env.SHELL ?? "",
  visual: AnsiStyleOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  const lowerShell = shell.toLowerCase();
  const placeholderKey = t("init.placeholderKey");
  const restartTerminal = t("init.restartTerminal");
  if (lowerShell.includes("fish")) {
    return [
      formatInitSection(t("init.currentAndPermanent"), visual),
      "",
      formatInitCommand(`set -Ux ${envName} "${placeholderKey}"`, visual),
      "",
      restartTerminal,
    ].join("\n");
  }

  if (lowerShell.includes("powershell") || lowerShell.includes("pwsh")) {
    return [
      formatInitSection(t("init.currentSession"), visual),
      "",
      formatInitCommand(`$env:${envName}="${placeholderKey}"`, visual),
      "",
      formatInitSection(t("init.userPermanent"), visual),
      "",
      "[Environment]::SetEnvironmentVariable(",
      `  "${envName}",`,
      `  "${placeholderKey}",`,
      '  "User"',
      ")",
      "",
      restartTerminal,
    ].join("\n");
  }

  const rcFile = lowerShell.includes("bash") ? "~/.bashrc" : "~/.zshrc";
  return [
    formatInitSection(t("init.currentSession"), visual),
    "",
    formatInitCommand(`export ${envName}="${placeholderKey}"`, visual),
    "",
    formatInitSection(t("init.permanent"), visual),
    "",
    formatInitCommand(`echo 'export ${envName}="${placeholderKey}"' >> ${rcFile}`, visual),
    "",
    restartTerminal,
  ].join("\n");
}

export function buildSummary(
  config: Config,
  keyStatus: ApiKeyStatus,
  visual: AnsiStyleOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  const maxOutputSummary =
    config.maxOutputTokens === undefined
      ? t("doctor.adaptive")
      : `${String(config.maxOutputTokens)} tokens`;
  const lines = [
    formatInitSection(t("init.summary"), visual),
    "",
    formatInitMetric("Provider", providerLabel(config.defaultProvider), "info", visual),
    formatInitMetric(t("doctor.model"), config.defaultModel, "info", visual),
    formatInitMetric(
      t("init.apiKey"),
      formatKeySummary(keyStatus, t),
      keyStatus.detected || keyStatus.optional ? "success" : "warning",
      visual,
    ),
    formatInitMetric(t("doctor.profile"), config.defaultProfile, "info", visual),
    formatInitMetric(t("init.level"), config.defaultLevel, "info", visual),
    formatInitMetric(t("init.uiLanguage"), formatUiLocale(config.uiLocale, t), "text", visual),
    formatInitMetric(
      t("init.outputLanguage"),
      formatOutputLanguage(config.outputLanguage, t),
      "text",
      visual,
    ),
    formatInitMetric(
      t("init.copyAuto"),
      config.copyAfterGeneration ? t("init.yes") : t("init.no"),
      "text",
      visual,
    ),
    formatInitMetric(
      t("init.streaming"),
      config.stream ? t("init.yes") : t("init.no"),
      "text",
      visual,
    ),
    formatInitMetric(t("doctor.timeout"), `${String(config.timeoutMs)} ms`, "text", visual),
    formatInitMetric(t("init.maxOutput"), maxOutputSummary, "text", visual),
    formatInitMetric(
      t("stats.title"),
      config.showStats ? t("init.yes") : t("init.no"),
      "text",
      visual,
    ),
    formatInitMetric(t("init.telemetry"), t("init.disabled"), "success", visual),
  ];

  const compatible = firstCompatibleProvider(config);
  if (compatible) {
    lines.splice(5, 0, formatInitMetric("Base URL", compatible.baseUrl, "text", visual));
    lines.splice(
      6,
      0,
      formatInitMetric(
        t("init.keyVariable"),
        compatible.apiKeyEnv ?? t("init.none"),
        "text",
        visual,
      ),
    );
    lines.splice(
      7,
      0,
      formatInitMetric(
        t("init.providerName"),
        compatible.name ?? getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label,
        "text",
        visual,
      ),
    );
  }

  return lines.join("\n");
}

export function buildPostInitSecurityNote(
  keyStatus: ApiKeyStatus,
  shell = process.env.SHELL ?? "",
  visual: AnsiStyleOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  if (!keyStatus.envName || keyStatus.detected) {
    return "";
  }
  const credentialProvider = credentialProviderFromEnvName(keyStatus.envName);
  const secureStorageLines = credentialProvider
    ? [
        t("init.secureMethod"),
        "",
        formatInitCommand(`rp auth login ${credentialProvider}`, visual),
        "",
      ]
    : [];

  return [
    formatInitSection(t("init.keySetup"), visual),
    "",
    t("init.keyRequiredNote"),
    ...secureStorageLines,
    t("init.envAlternative"),
    "",
    buildShellInstructions(keyStatus.envName, shell, visual, t),
  ].join("\n");
}

/** Asks for confirmation before discarding an existing configuration. */
async function confirmOverwrite(io: InitIo, question: string): Promise<Config | null> {
  const confirmed = await askConfirm(io, question, false);
  if (!confirmed) {
    writeCancellation(io);
    return null;
  }
  return DEFAULT_CONFIG;
}

function writeCancellation(io: InitIo): void {
  io.write(`${formatInitStatus(io.t("init.cancelled"), "warning", io.visual)}\n`);
}

/** Asks for a model identifier until one is given; Enter keeps `proposed` when there is one. */
async function askModelText(io: InitIo, proposed: string): Promise<string> {
  for (;;) {
    const model = await askText(io, io.t("init.modelId"), proposed);
    if (model) {
      return model;
    }
    io.write(`${formatInitStatus(io.t("init.modelRequired"), "error", io.visual)}\n`);
  }
}

/** The saved model, when it was saved for this provider: another's means nothing here. */
function savedModelFor(defaults: Config, provider: InitProvider): string | undefined {
  return defaults.defaultProvider === provider && defaults.defaultModel
    ? defaults.defaultModel
    : undefined;
}

/**
 * Resolves the configuration the wizard starts from.
 *
 * Returns null when nothing should be written: the user cancelled, or only
 * asked to display the existing configuration.
 */
async function resolveBaseConfig(io: InitIo, reset: boolean): Promise<Config | null> {
  if (!existsSync(configPath())) {
    writeIntro(io);
    return DEFAULT_CONFIG;
  }

  // A reset starts from the defaults and never reads the file it replaces:
  // reading it first would refuse the very file a reset exists to recover.
  if (reset) {
    writeIntro(io);
    return await confirmOverwrite(io, io.t("init.overwriteDefaults"));
  }

  // Les valeurs de départ de l'assistant sont celles de la personne : elles
  // finissent enregistrées, et un réglage venu du projet courant deviendrait
  // permanent en passant par là.
  const existingConfig = await loadUserConfig();

  const action = await askExistingConfigAction(io);
  if (action === "cancel") {
    writeCancellation(io);
    return null;
  }
  if (action === "show") {
    io.write(`${JSON.stringify(existingConfig, null, 2)}\n`);
    return null;
  }
  if (action === "reset") {
    return await confirmOverwrite(io, io.t("init.overwrite"));
  }
  return existingConfig;
}

/** Collects choices, shows the summary, and loops until the user saves or cancels. */
async function runConfigurationLoop(
  io: InitIo,
  baseConfig: Config,
  env: NodeJS.ProcessEnv,
  shell: string,
): Promise<void> {
  for (;;) {
    const collected = await collectConfig(io, baseConfig, env, shell);
    const config = createInitConfig({ ...collected, existing: baseConfig });
    const keyStatus = buildApiKeyStatus(
      collected.provider,
      env,
      collected.compatibleProvider?.apiKeyEnv,
    );

    io.write(`\n${buildSummary(config, keyStatus, io.visual, io.t)}\n\n`);
    const decision = await askMenu(io, io.t("init.nextAction"), [
      io.t("init.save"),
      io.t("init.modify"),
      io.t("init.cancel"),
    ]);

    if (decision === 1) {
      continue;
    }
    if (decision === 2) {
      writeCancellation(io);
      return;
    }

    await saveConfig(config);
    await verifySavedConfig(config, keyStatus, io);
    const securityNote = buildPostInitSecurityNote(keyStatus, shell, io.visual, io.t);
    if (securityNote) {
      io.write(`\n${securityNote}\n`);
    }
    await maybeRunConnectionTest(config, keyStatus, io, env);
    return;
  }
}

export async function runFirstRunSetup(
  options: RunFirstRunOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<void> {
  const env = options.env ?? process.env;
  // Checked before the terminal is opened: a refused key would otherwise leave
  // an interface reading the input after the setup has given up.
  await hydrateCredentials(env);
  const io = createIo(
    options.input ?? process.stdin,
    options.output ?? process.stdout,
    env,
    t,
    options.totalMemoryBytes ?? os.totalmem(),
  );
  const shell = options.shell ?? process.env.SHELL ?? "";

  try {
    const baseConfig = await resolveBaseConfig(io, options.reset ?? false);
    if (!baseConfig) {
      return;
    }
    await runConfigurationLoop(io, baseConfig, env, shell);
  } finally {
    io.close();
  }
}

/**
 * Asks for the model to use.
 *
 * An OpenAI-compatible endpoint publishes no preset catalogue. One on the
 * user's own hardware publishes what it has installed, though: that list is
 * offered, so the model saved is one the server can run. When it has none —
 * or cannot be reached — the model this machine can hold is recommended, with
 * the command that installs it. A hosted endpoint, whose catalogue can run to
 * hundreds of models, is asked for an identifier as before.
 *
 * The saved model is proposed only when it was saved for such an endpoint: a
 * fresh setup holds the Anthropic default, which no local server serves.
 */
async function askModelIdentifier(
  io: InitIo,
  providerChoice: InitProviderChoice,
  defaults: Config,
  endpoint: CompatibleEndpointAnswer | undefined,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (!endpoint) {
    return await askModel(io, providerChoice.provider, defaults);
  }
  const savedModel = savedModelFor(defaults, OPENAI_COMPATIBLE_PROVIDER_ID);
  const { provider } = endpoint;
  if (!isLocalEndpoint(provider.baseUrl)) {
    return await askModelText(io, savedModel ?? "");
  }

  const installed = await installedModelsOf(endpoint, env);
  const recommendation = recommendLocalModel(io.totalMemoryBytes);
  if (installed !== undefined && installed.length > 0) {
    return await askInstalledModel(io, installed, savedModel, recommendation.id);
  }
  writeLocalModelAdvice(io, provider, installed !== undefined);
  return await askModelText(io, savedModel ?? recommendation.id);
}

/**
 * The chat models the endpoint has installed, or undefined when it could not
 * say. Taken from the detection when it probed that very URL.
 */
async function installedModelsOf(
  endpoint: CompatibleEndpointAnswer,
  env: NodeJS.ProcessEnv,
): Promise<string[] | undefined> {
  const { provider, detected } = endpoint;
  const baseUrl = trimTrailingSlashes(provider.baseUrl.trim());
  const probed = detected.find((server) => server.baseUrl === baseUrl);
  if (probed) {
    return probed.reachable ? probed.models : undefined;
  }
  try {
    return await listInstalledModels({
      baseUrl,
      label: provider.name ?? baseUrl,
      apiKey: provider.apiKeyEnv ? env[provider.apiKeyEnv] : undefined,
      customHeaders: provider.customHeaders,
      timeoutMs: REPROMPT_POLICY.runtime.localServerProbeTimeoutMs,
    });
  } catch {
    return undefined;
  }
}

/** One installed model, or another identifier typed by hand. */
async function askInstalledModel(
  io: InitIo,
  installed: readonly string[],
  savedModel: string | undefined,
  recommendedId: string,
): Promise<string> {
  const labels = [...installed, io.t("init.manualModel")];
  const manualIndex = labels.length - 1;
  const recommendedIndex = installed.indexOf(recommendedId);
  const proposed =
    savedModel === undefined
      ? Math.max(recommendedIndex, 0)
      : proposedModelIndex(
          installed.map((id) => ({ id })),
          savedModel,
          manualIndex,
        );
  const index = await askMenu(io, io.t("init.installedModelQuestion"), labels, proposed);
  return installed[index] ?? (await askModelText(io, savedModel ?? ""));
}

/**
 * What to install when the server has no model to offer.
 *
 * Ollama installs one with a command, so the command is printed; LM Studio
 * has no such command, so the model is named for its search. A server that
 * did not answer is most likely not installed yet, and Ollama is the one with
 * a command to give.
 */
function writeLocalModelAdvice(
  io: InitIo,
  provider: CompatibleProviderInput,
  reachable: boolean,
): void {
  const recommendation = recommendLocalModel(io.totalMemoryBytes);
  const server = provider.name ?? provider.baseUrl;
  const lines = [
    "",
    formatInitStatus(
      reachable
        ? io.t("init.localNoModel", { server })
        : io.t("init.localUnreachable", { baseUrl: provider.baseUrl }),
      "warning",
      io.visual,
    ),
    io.t("init.localRecommendation", {
      model: recommendation.id,
      memoryGb: recommendation.memoryGb,
      minGb: recommendation.sizeGb.min,
      maxGb: recommendation.sizeGb.max,
    }),
    "",
    localServerKind(provider.baseUrl) === "lmstudio"
      ? io.t("init.localLmStudioSearch", { searchTerm: recommendation.searchTerm })
      : formatInitCommand(recommendation.pullCommand, io.visual),
    "",
  ];
  io.write(`${lines.join("\n")}\n`);
}

async function collectConfig(
  io: InitIo,
  defaults: Config,
  env: NodeJS.ProcessEnv,
  shell: string,
): Promise<Omit<InitConfigInput, "existing">> {
  for (;;) {
    const providerChoice = await askProvider(io, defaults);
    const endpoint =
      providerChoice.provider === OPENAI_COMPATIBLE_PROVIDER_ID
        ? await askCompatibleProvider(io, defaults, providerChoice.local)
        : undefined;
    const compatibleProvider = endpoint?.provider;
    const keyStatus = buildApiKeyStatus(
      providerChoice.provider,
      env,
      compatibleProvider?.apiKeyEnv,
    );
    io.write(
      `${formatInitStatus(
        formatApiKeyStatus(keyStatus, io.t),
        keyStatus.detected || keyStatus.optional ? "success" : "warning",
        io.visual,
      )}\n`,
    );

    if (!keyStatus.detected && !keyStatus.optional) {
      const keyAction = await askMenu(io, io.t("init.continueHow"), [
        io.t("init.showInstructions"),
        io.t("init.continueWithoutKey"),
        io.t("init.backProvider"),
      ]);
      if (keyAction === 0 && keyStatus.envName) {
        io.write(`\n${buildShellInstructions(keyStatus.envName, shell, io.visual, io.t)}\n\n`);
      }
      if (keyAction === 2) {
        continue;
      }
    }

    const model = await askModelIdentifier(io, providerChoice, defaults, endpoint, env);

    return {
      provider: providerChoice.provider,
      compatibleProvider,
      model,
      profile: await askProfile(io, defaults.defaultProfile),
      level: await askLevel(io, defaults.defaultLevel),
      copyAfterGeneration: await askConfirm(
        io,
        io.t("init.copyQuestion"),
        defaults.copyAfterGeneration,
      ),
      uiLocale: await askUiLocale(io, defaults.uiLocale),
      outputLanguage: await askOutputLanguage(io, defaults.outputLanguage),
      stream: await askConfirm(io, io.t("init.streamQuestion"), defaults.stream),
      timeoutMs: await askTimeout(io, defaults.timeoutMs),
    };
  }
}

function writeIntro(io: InitIo): void {
  io.write(`${formatInitHeading("reqraft init", io.t("init.subtitle"), io.visual)}\n\n`);
  io.write(`${io.t("init.intro")}\n`);
  io.write(`${io.t("init.security")}\n\n`);
}

async function askExistingConfigAction(
  io: InitIo,
): Promise<"modify" | "reset" | "show" | "cancel"> {
  io.write(`${formatInitSection(io.t("init.existingTitle"), io.visual)}\n`);
  io.write(`${io.t("init.existing")}\n\n`);
  const choice = await askMenu(io, "", [
    io.t("init.modifyExisting"),
    io.t("init.resetDefaults"),
    io.t("init.showConfig"),
    io.t("init.cancel"),
  ]);
  if (choice === 1) return "reset";
  if (choice === 2) return "show";
  if (choice === 3) return "cancel";
  return "modify";
}

async function askProvider(io: InitIo, defaults: Config): Promise<InitProviderChoice> {
  const choices = getInitProviderChoices(io.t);
  const defaultIndex = Math.max(
    choices.findIndex((choice) => choice.provider === defaults.defaultProvider),
    0,
  );
  const index = await askMenu(
    io,
    io.t("init.providerQuestion"),
    choices.map((choice) => choice.label),
    defaultIndex,
  );
  const fallback = choices[0];
  if (!fallback) {
    throw new Error(io.t("init.noProvider"));
  }
  return choices[index] ?? fallback;
}

/** The endpoint answers, with what the detection found on the way. */
interface CompatibleEndpointAnswer {
  provider: CompatibleProviderInput;
  detected: DetectedLocalServer[];
}

async function askCompatibleProvider(
  io: InitIo,
  defaults: Config,
  local = false,
): Promise<CompatibleEndpointAnswer> {
  const saved = firstCompatibleProvider(defaults);
  // A local server is set up from the saved endpoint only when that one is
  // local too: a hosted gateway's URL is no starting point for Ollama.
  const existing = local && saved && !isLocalEndpoint(saved.baseUrl) ? undefined : saved;
  const detected = local ? await reportLocalServers(io) : [];
  const chosen = local && !existing ? await chooseLocalServer(io, detected) : undefined;
  const idDefault = local ? "local" : "custom";
  const id = await askText(io, io.t("init.internalProviderId"), existing?.id ?? idDefault);
  const name = await askText(
    io,
    io.t("init.customProviderName"),
    existing?.name ??
      (local
        ? (chosen?.label ?? io.t("init.localServer"))
        : getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label),
  );
  const baseUrl = await askText(
    io,
    "Base URL",
    existing?.baseUrl ?? proposedBaseUrl(local, chosen),
  );
  const apiKeyEnv = await askText(io, io.t("init.apiKeyEnv"), existing?.apiKeyEnv ?? "");
  const customHeaders = await askCustomHeaders(io, existing?.customHeaders);
  return {
    provider: {
      id,
      name: name ? name : undefined,
      baseUrl,
      apiKeyEnv: apiKeyEnv ? apiKeyEnv : undefined,
      customHeaders,
    },
    detected,
  };
}

/** The address a new endpoint starts from: the server detected, or Ollama's. */
function proposedBaseUrl(local: boolean, chosen: DetectedLocalServer | undefined): string {
  if (!local) return "https://example.com/v1";
  return chosen?.baseUrl ?? LOCAL_SERVERS[0]?.baseUrl ?? "";
}

/** Looks for Ollama and LM Studio on their default ports, and says what it found. */
async function reportLocalServers(io: InitIo): Promise<DetectedLocalServer[]> {
  const servers = await detectLocalServers();
  const lines = servers.map((server) =>
    formatInitStatus(
      server.reachable
        ? io.t("init.localServerFound", {
            server: server.label,
            baseUrl: server.baseUrl,
            count: server.models.length,
          })
        : io.t("init.localServerMissing", { server: server.label, baseUrl: server.baseUrl }),
      server.reachable ? "success" : "info",
      io.visual,
    ),
  );
  if (!servers.some((server) => server.reachable)) {
    lines.push("", io.t("init.localServersNone"));
  }
  io.write(`\n${formatInitSection(io.t("init.localServersTitle"), io.visual)}\n\n`);
  io.write(`${lines.join("\n")}\n\n`);
  return servers;
}

/**
 * The detected server to propose: the only one running, or — when both
 * are — the one the person picks, the one with models first.
 */
async function chooseLocalServer(
  io: InitIo,
  servers: readonly DetectedLocalServer[],
): Promise<DetectedLocalServer | undefined> {
  const running = servers.filter((server) => server.reachable);
  if (running.length < 2) {
    return running[0];
  }
  const index = await askMenu(
    io,
    io.t("init.localServerQuestion"),
    running.map((server) =>
      io.t("init.localServerChoice", { server: server.label, count: server.models.length }),
    ),
    Math.max(
      running.findIndex((server) => server.models.length > 0),
      0,
    ),
  );
  return running[index] ?? running[0];
}

async function askModel(io: InitIo, provider: InitProvider, defaults: Config): Promise<string> {
  const savedModel = savedModelFor(defaults, provider);
  const presets = getPresetModels().filter((preset) => preset.provider === provider);
  if (presets.length === 0) {
    return await askModelText(io, savedModel ?? "");
  }

  const recommended = presets.find((preset) => preset.recommended);
  const ordered = [
    ...(recommended ? [recommended] : []),
    ...presets.filter((preset) => preset.id !== recommended?.id),
  ];
  const labels = ordered.map(
    (preset) =>
      `${preset.name} (${preset.id}) - ${modelDescription(preset.id, preset.description, io.t)}`,
  );
  labels.push(io.t("init.manualModel"));
  const manualIndex = labels.length - 1;

  const index = await askMenu(
    io,
    io.t("init.modelQuestion"),
    labels,
    proposedModelIndex(ordered, savedModel, manualIndex),
  );
  const chosen = ordered[index];
  return chosen ? chosen.id : await askModelText(io, savedModel ?? "");
}

/**
 * The entry Enter keeps in the model list: the saved model — through the
 * manual entry for an identifier typed by hand — or else the recommended one.
 */
function proposedModelIndex(
  ordered: readonly { id: string }[],
  savedModel: string | undefined,
  manualIndex: number,
): number {
  if (savedModel === undefined) {
    return 0;
  }
  const savedIndex = ordered.findIndex((preset) => preset.id === savedModel);
  return savedIndex >= 0 ? savedIndex : manualIndex;
}

async function askProfile(io: InitIo, currentProfile: string): Promise<string> {
  const profiles = getInitProfileChoices();
  const defaultIndex = Math.max(profiles.indexOf(currentProfile), 0);
  const index = await askMenu(io, io.t("init.defaultProfile"), profiles, defaultIndex);
  return profiles[index] ?? AUTO_PROFILE_ID;
}

async function askLevel(
  io: InitIo,
  currentLevel: Config["defaultLevel"],
): Promise<Config["defaultLevel"]> {
  const levels = [...REPROMPT_LEVELS];
  // The saved level is proposed, whichever it is; the default level only
  // stands in for one the list does not know.
  const savedIndex = levels.indexOf(currentLevel);
  const defaultIndex = savedIndex >= 0 ? savedIndex : levels.indexOf(DEFAULT_REPROMPT_LEVEL);
  const index = await askMenu(io, io.t("init.level"), levels, defaultIndex);
  return levels[index] ?? DEFAULT_REPROMPT_LEVEL;
}

async function askUiLocale(
  io: InitIo,
  currentLocale: Config["uiLocale"],
): Promise<UiLocalePreference> {
  const choices: UiLocalePreference[] = ["auto", "en", "fr"];
  const labels = choices.map((choice) => formatUiLocale(choice, io.t));
  const defaultIndex = Math.max(choices.indexOf(currentLocale), 0);
  const index = await askMenu(io, io.t("init.uiLanguageQuestion"), labels, defaultIndex);
  return choices[index] ?? "auto";
}

async function askOutputLanguage(
  io: InitIo,
  currentLanguage: Config["outputLanguage"],
): Promise<string> {
  const commonChoices = ["auto", "en", "fr"] as const;
  const labels = [
    ...commonChoices.map((choice) => formatOutputLanguage(choice, io.t)),
    io.t("init.outputLanguageCustom"),
  ];
  const commonIndex = commonChoices.findIndex((choice) => choice === currentLanguage);
  const defaultIndex = commonIndex >= 0 ? commonIndex : labels.length - 1;
  const index = await askMenu(io, io.t("init.outputLanguageQuestion"), labels, defaultIndex);
  if (index === labels.length - 1) {
    return await askText(io, io.t("init.outputLanguageCustomPrompt"), currentLanguage);
  }
  return commonChoices[index] ?? "auto";
}

async function askTimeout(io: InitIo, currentTimeout: number): Promise<number> {
  for (;;) {
    const answer = await askText(
      io,
      io.t("init.timeoutQuestion"),
      String(currentTimeout > 0 ? currentTimeout : REPROMPT_POLICY.runtime.defaultTimeoutMs),
    );
    const timeout = Number(answer);
    if (Number.isInteger(timeout) && timeout > 0) {
      return timeout;
    }
    io.write(`${formatInitStatus(io.t("init.timeoutInvalid"), "error", io.visual)}\n`);
  }
}

async function verifySavedConfig(
  expected: Config,
  keyStatus: ApiKeyStatus,
  io: InitIo,
): Promise<void> {
  // Relire ce qui vient d'être écrit, sans la couche projet : sinon une
  // convention de dépôt ferait échouer la vérification d'un enregistrement
  // pourtant correct.
  const saved = await loadUserConfig();
  ConfigSchema.parse(saved);
  if (
    saved.defaultProvider !== expected.defaultProvider ||
    saved.defaultModel !== expected.defaultModel ||
    saved.defaultProfile !== expected.defaultProfile ||
    saved.defaultLevel !== expected.defaultLevel
  ) {
    throw new Error(io.t("init.savedMismatch"));
  }

  io.write(`\n${formatInitStatus(io.t("init.saved"), "success", io.visual)}\n\n`);
  io.write(`${formatInitSection(io.t("init.active"), io.visual)}\n\n`);
  io.write(`${formatInitMetric(io.t("doctor.file"), configPath(), "text", io.visual)}\n`);
  io.write(
    `${formatInitMetric("Provider", providerLabel(saved.defaultProvider), "info", io.visual)}\n`,
  );
  io.write(`${formatInitMetric(io.t("doctor.model"), saved.defaultModel, "info", io.visual)}\n`);
  io.write(
    `${formatInitMetric(
      io.t("init.apiKey"),
      keyStatus.detected ? io.t("doctor.configured") : io.t("doctor.notConfigured"),
      keyStatus.detected ? "success" : "warning",
      io.visual,
    )}\n`,
  );
}

async function maybeRunConnectionTest(
  config: Config,
  keyStatus: ApiKeyStatus,
  io: InitIo,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (!keyStatus.detected && config.defaultProvider !== OPENAI_COMPATIBLE_PROVIDER_ID) {
    return;
  }

  const wantsTest = await askConfirm(io, io.t("init.connectionQuestion"), false);
  if (!wantsTest) {
    return;
  }

  const startedAt = Date.now();
  const provider = createProvider(config.defaultProvider, env, config);
  // A local server loads the model on its first request, which is this one:
  // it gets the generation timeout, not the ten seconds of a key check.
  const timeoutMs = provider.local
    ? config.timeoutMs
    : Math.min(config.timeoutMs, REPROMPT_POLICY.runtime.connectionCheckTimeoutMs);
  try {
    await provider.generate({
      systemPrompt: "Réponds brièvement.",
      userPrompt: "Test de connexion Reqraft.",
      model: config.defaultModel,
      temperature: REPROMPT_POLICY.runtime.connectionCheckTemperature,
      maxOutputTokens: REPROMPT_POLICY.runtime.connectionCheckMaxOutputTokens,
      stream: false,
      signal: AbortSignal.timeout(timeoutMs),
    });
    io.write(
      `${formatInitStatus(
        io.t("init.connectionSuccess", { durationMs: Date.now() - startedAt }),
        "success",
        io.visual,
      )}\n`,
    );
  } catch (error) {
    // The deadline is this check's own: it names its duration, instead of
    // reading as a server that could not be reached.
    const failure = isTimeoutError(error) ? new RequestTimeoutError(timeoutMs) : error;
    io.write(
      `${formatInitStatus(
        io.t("init.connectionFailed", {
          reason: formatUiError(failure, config.defaultProvider, io.t),
        }),
        "error",
        io.visual,
      )}\n`,
    );
  }
}

function firstCompatibleProvider(
  config: Config,
): (CompatibleProviderInput & { id: string }) | undefined {
  const providers = config.providers ?? {};
  const entry = Object.entries(providers)[0];
  if (!entry) {
    return undefined;
  }
  const [id, provider] = entry;
  return {
    id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKeyEnv: provider.apiKeyEnv,
    customHeaders: provider.customHeaders,
  };
}

function formatKeySummary(status: ApiKeyStatus, t: Translator): string {
  if (!status.envName) {
    return t("init.keyOptional");
  }
  return status.detected
    ? t("init.keyDetectedIn", { envName: status.envName })
    : t("init.keyNotDetectedIn", { envName: status.envName });
}

function providerLabel(provider: Config["defaultProvider"]): string {
  return getProviderDefinition(provider).label;
}

function formatUiLocale(locale: Config["uiLocale"], t: Translator): string {
  if (locale === "auto") return t("init.languageAuto");
  if (locale === "en") return t("init.languageEnglish");
  return t("init.languageFrench");
}

function formatOutputLanguage(language: Config["outputLanguage"], t: Translator): string {
  if (language === "auto") return t("init.outputLanguageAuto");
  if (language === "en") return t("init.languageEnglish");
  if (language === "fr") return t("init.languageFrench");
  return language;
}

function credentialProviderFromEnvName(envName: string): CredentialProvider | undefined {
  const match = listCredentialProviders().find(
    (definition) =>
      isCredentialProvider(definition.id) && getProviderEnvName(definition.id) === envName,
  );
  return match?.id;
}

/**
 * Asks for the custom headers until the answer is empty or a JSON object.
 *
 * Enter keeps the saved headers and an empty object removes them. The question
 * names the saved headers without their values: one may carry a token.
 */
async function askCustomHeaders(
  io: InitIo,
  saved: Record<string, string> | undefined,
): Promise<Record<string, string> | undefined> {
  const savedNames = Object.keys(saved ?? {}).join(", ");
  for (;;) {
    const answer = await io.question(
      formatInitPrompt(io.t("init.customHeaders"), savedNames, io.visual),
    );
    if (!answer) {
      return saved;
    }
    const headers = parseHeaders(answer);
    if (headers) {
      return Object.keys(headers).length > 0 ? headers : undefined;
    }
    io.write(`${formatInitStatus(io.t("init.headersInvalid"), "error", io.visual)}\n`);
  }
}

/** The headers typed as a JSON object, or null when the answer is not one. */
function parseHeaders(input: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

interface InitIo {
  visual: AnsiStyleOptions;
  t: Translator;
  /** The machine's memory, for the local model recommendation. */
  totalMemoryBytes: number;
  write(message: string): void;
  question(prompt: string): Promise<string>;
  close(): void;
}

function createIo(
  input: Readable,
  output: Writable,
  env: NodeJS.ProcessEnv,
  t: Translator,
  totalMemoryBytes: number,
): InitIo {
  const rl = readline.createInterface({ input, output });
  const visual = detectCapabilities(env, Boolean((output as Writable & { isTTY?: boolean }).isTTY));
  return {
    visual,
    t,
    totalMemoryBytes,
    write(message: string): void {
      output.write(message);
    },
    question(prompt: string): Promise<string> {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim());
        });
      });
    },
    close(): void {
      rl.close();
    },
  };
}

async function askMenu(
  io: InitIo,
  question: string,
  choices: string[],
  defaultIndex = 0,
): Promise<number> {
  if (question) {
    io.write(`${formatInitQuestion(question, io.visual)}\n\n`);
  }
  for (const [index, choice] of choices.entries()) {
    io.write(`${formatInitChoice(index, choice, index === defaultIndex, io.visual)}\n`);
  }
  io.write("\n");

  for (;;) {
    const answer = await io.question(
      formatInitPrompt(io.t("init.yourChoice"), String(defaultIndex + 1), io.visual),
    );
    if (!answer) {
      return defaultIndex;
    }
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && index >= 0 && index < choices.length) {
      return index;
    }
    io.write(`${formatInitStatus(io.t("init.invalidChoice"), "error", io.visual)}\n`);
  }
}

async function askConfirm(io: InitIo, question: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? "O/n" : "o/N";
  for (;;) {
    const answer = (await io.question(formatInitPrompt(question, suffix, io.visual))).toLowerCase();
    if (!answer) {
      return defaultValue;
    }
    if (["o", "oui", "y", "yes"].includes(answer)) {
      return true;
    }
    if (["n", "non", "no"].includes(answer)) {
      return false;
    }
    io.write(`${formatInitStatus(io.t("init.yesNo"), "error", io.visual)}\n`);
  }
}

async function askText(io: InitIo, question: string, defaultValue: string): Promise<string> {
  const answer = await io.question(formatInitPrompt(question, defaultValue, io.visual));
  return answer ? answer : defaultValue;
}
