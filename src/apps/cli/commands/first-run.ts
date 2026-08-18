import process from "node:process";
import readline from "node:readline";
import { existsSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { ConfigSchema, type Config } from "@/config/schema.js";
import { configPath, loadConfig, saveConfig, DEFAULT_CONFIG } from "@/config/loader.js";
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
import { REPROMPT_LEVELS } from "@/core/levels.js";
import { REPROMPT_POLICY } from "@/core/reprompt-policy.js";
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

interface ApiKeyStatus {
  envName?: string;
  detected: boolean;
  optional?: boolean;
}

interface CompatibleProviderInput {
  id: string;
  name?: string;
  baseUrl: string;
  apiKeyEnv?: string;
  customHeaders?: Record<string, string>;
}

interface InitConfigInput {
  provider: InitProvider;
  model: string;
  profile: string;
  level: Config["defaultLevel"];
  copyAfterGeneration: boolean;
  stream: boolean;
  timeoutMs: number;
  uiLocale?: Config["uiLocale"];
  outputLanguage?: Config["outputLanguage"];
  compatibleProvider?: CompatibleProviderInput;
  existing?: Config;
}

interface RunFirstRunOptions {
  reset?: boolean;
  input?: Readable;
  output?: Writable;
  env?: NodeJS.ProcessEnv;
  shell?: string;
}

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

export function buildApiKeyStatus(
  provider: InitProvider,
  env: NodeJS.ProcessEnv,
  apiKeyEnv?: string,
): ApiKeyStatus {
  const definition = getProviderDefinition(provider);
  const envName = apiKeyEnv ?? definition.apiKeyEnvName;
  const optional = !definition.requiresApiKey;
  if (!envName) {
    return {
      detected: false,
      optional,
    };
  }

  const detected = Boolean(env[envName]);
  return {
    envName,
    detected,
    optional,
  };
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

export function createInitConfig(input: InitConfigInput): Config {
  const providers = { ...(input.existing?.providers ?? {}) };
  if (input.compatibleProvider) {
    providers[input.compatibleProvider.id] = {
      type: OPENAI_COMPATIBLE_PROVIDER_ID,
      name: input.compatibleProvider.name,
      baseUrl: input.compatibleProvider.baseUrl,
      apiKeyEnv: input.compatibleProvider.apiKeyEnv,
      customHeaders: input.compatibleProvider.customHeaders,
    };
  }

  return ConfigSchema.parse({
    ...(input.existing ?? {}),
    defaultProvider: input.provider,
    defaultModel: input.model,
    defaultProfile: input.profile,
    defaultLevel: input.level,
    copyAfterGeneration: input.copyAfterGeneration,
    stream: input.stream,
    timeoutMs: input.timeoutMs,
    uiLocale: input.uiLocale ?? input.existing?.uiLocale ?? DEFAULT_CONFIG.uiLocale,
    outputLanguage:
      input.outputLanguage ?? input.existing?.outputLanguage ?? DEFAULT_CONFIG.outputLanguage,
    showChanges: input.existing?.showChanges ?? DEFAULT_CONFIG.showChanges,
    showStats: input.existing?.showStats ?? DEFAULT_CONFIG.showStats,
    telemetry: false,
    providers: Object.keys(providers).length > 0 ? providers : undefined,
  });
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

async function askModelText(io: InitIo, currentModel: string): Promise<string> {
  return await askText(io, io.t("init.modelId"), currentModel);
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

  const existingConfig = await loadConfig();

  if (reset) {
    writeIntro(io);
    return await confirmOverwrite(io, io.t("init.overwriteDefaults"));
  }

  const action = await askExistingConfigAction(io, existingConfig);
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
  const io = createIo(options.input ?? process.stdin, options.output ?? process.stdout, env, t);
  await hydrateCredentials(env);
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
 * A self-hosted or custom OpenAI-compatible endpoint publishes no preset
 * catalogue, so the identifier is typed in. Every other case, including a
 * compatible provider matching a known gateway, goes through the preset list.
 */
async function askModelIdentifier(
  io: InitIo,
  provider: InitProvider,
  defaults: Config,
  compatibleProvider: CompatibleProviderInput | undefined,
): Promise<string> {
  if (compatibleProvider?.baseUrl) {
    if (compatibleProvider.id === "local") {
      return await askModelText(io, defaults.defaultModel || "local-model");
    }
    if (compatibleProvider.id === "custom") {
      return await askModelText(io, defaults.defaultModel);
    }
  }
  return await askModel(io, provider, defaults.defaultModel);
}

async function collectConfig(
  io: InitIo,
  defaults: Config,
  env: NodeJS.ProcessEnv,
  shell: string,
): Promise<Omit<InitConfigInput, "existing">> {
  for (;;) {
    const providerChoice = await askProvider(io, defaults);
    const compatibleProvider =
      providerChoice.provider === OPENAI_COMPATIBLE_PROVIDER_ID
        ? await askCompatibleProvider(io, defaults, providerChoice.local)
        : undefined;
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

    const model = await askModelIdentifier(
      io,
      providerChoice.provider,
      defaults,
      compatibleProvider,
    );

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
  existingConfig: Config,
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
  if (choice === 2) {
    io.write(`${JSON.stringify(existingConfig, null, 2)}\n`);
    return "show";
  }
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

async function askCompatibleProvider(
  io: InitIo,
  defaults: Config,
  local = false,
): Promise<CompatibleProviderInput> {
  const existing = firstCompatibleProvider(defaults);
  const idDefault = local ? "local" : "custom";
  const id = await askText(io, io.t("init.internalProviderId"), existing?.id ?? idDefault);
  const name = await askText(
    io,
    io.t("init.customProviderName"),
    existing?.name ??
      (local
        ? io.t("init.localServer")
        : getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label),
  );
  const baseUrl = await askText(
    io,
    "Base URL",
    existing?.baseUrl ?? (local ? "http://localhost:11434/v1" : "https://example.com/v1"),
  );
  const apiKeyEnv = await askText(io, io.t("init.apiKeyEnv"), existing?.apiKeyEnv ?? "");
  const headersInput = await askText(io, io.t("init.customHeaders"), "");
  const customHeaders = parseHeaders(headersInput, io.t);
  return {
    id,
    name: name ? name : undefined,
    baseUrl,
    apiKeyEnv: apiKeyEnv ? apiKeyEnv : undefined,
    customHeaders,
  };
}

async function askModel(io: InitIo, provider: InitProvider, currentModel: string): Promise<string> {
  const presets = getPresetModels().filter((preset) => preset.provider === provider);
  if (presets.length === 0) {
    return await askModelText(io, currentModel);
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

  const index = await askMenu(io, io.t("init.modelQuestion"), labels);
  if (index === labels.length - 1) {
    return await askModelText(io, currentModel);
  }
  return ordered[index]?.id ?? currentModel;
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
  const defaultIndex = Math.max(levels.indexOf(currentLevel), 1);
  const index = await askMenu(io, io.t("init.level"), levels, defaultIndex);
  return levels[index] ?? "standard";
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
  const saved = await loadConfig();
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
  try {
    const provider = createProvider(config.defaultProvider, env, config);
    await provider.generate({
      systemPrompt: "Réponds brièvement.",
      userPrompt: "Test de connexion Reqraft.",
      model: config.defaultModel,
      temperature: REPROMPT_POLICY.runtime.connectionCheckTemperature,
      maxOutputTokens: REPROMPT_POLICY.runtime.connectionCheckMaxOutputTokens,
      stream: false,
      signal: AbortSignal.timeout(
        Math.min(config.timeoutMs, REPROMPT_POLICY.runtime.connectionCheckTimeoutMs),
      ),
    });
    io.write(
      `${formatInitStatus(
        io.t("init.connectionSuccess", { durationMs: Date.now() - startedAt }),
        "success",
        io.visual,
      )}\n`,
    );
  } catch (error) {
    io.write(
      `${formatInitStatus(
        io.t("init.connectionFailed", {
          reason: formatUiError(error, config.defaultProvider, io.t),
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

function parseHeaders(input: string, t: Translator): Record<string, string> | undefined {
  if (!input.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t("init.headersInvalid"));
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

interface InitIo {
  visual: AnsiStyleOptions;
  t: Translator;
  write(message: string): void;
  question(prompt: string): Promise<string>;
  close(): void;
}

function createIo(
  input: Readable,
  output: Writable,
  env: NodeJS.ProcessEnv,
  t: Translator,
): InitIo {
  const rl = readline.createInterface({ input, output });
  const visual = detectCapabilities(env, Boolean((output as Writable & { isTTY?: boolean }).isTTY));
  return {
    visual,
    t,
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
