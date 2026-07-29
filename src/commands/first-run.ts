import process from "node:process";
import readline from "node:readline";
import { existsSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { ConfigSchema, type Config } from "../config/schema.js";
import { configPath, loadConfig, saveConfig, DEFAULT_CONFIG } from "../config/loader.js";
import { getPresetModels } from "../models/presets.js";
import { createProvider } from "../providers/registry.js";
import { hydrateCredentials } from "../auth/credentials.js";
import { formatUiError } from "../ui/errors.js";
import { REPROMPT_POLICY } from "../core/reprompt-policy.js";
import {
  type InitProvider,
  getProviderDefinition,
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "../providers/catalog.js";

interface InitProviderChoice {
  label: string;
  provider: InitProvider;
  local?: boolean;
}

interface ApiKeyStatus {
  envName?: string;
  detected: boolean;
  message: string;
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

const BUILTIN_PROFILES = [
  "auto",
  "clean",
  "code",
  "frontend",
  "web-design",
  "debug",
  "review",
  "writing",
];

const MODEL_ID_PROMPT = "Identifiant du modèle";
const SETUP_CANCELLED = "Initialisation annulée.\n";
const RESTART_TERMINAL_NOTE = "Relance ton terminal pour une configuration permanente.";

export function getInitProviderChoices(): InitProviderChoice[] {
  const choices = listProviderDefinitions()
    .filter((definition) => definition.visibleInInit)
    .map((definition) => ({
      label: definition.label,
      provider: definition.id as InitProvider,
    }));

  return [
    ...choices,
    {
      label: "Serveur local compatible OpenAI",
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
      message: "Aucune variable de clé API nécessaire.",
    };
  }

  const detected = Boolean(env[envName]);
  return {
    envName,
    detected,
    optional,
    message: `${envName} ${detected ? "détectée" : "non détectée"}.`,
  };
}

export function buildShellInstructions(envName: string, shell = process.env.SHELL ?? ""): string {
  const lowerShell = shell.toLowerCase();
  if (lowerShell.includes("fish")) {
    return [
      "Session actuelle et configuration permanente :",
      "",
      "```fish",
      `set -Ux ${envName} "votre-clé"`,
      "```",
      "",
      RESTART_TERMINAL_NOTE,
    ].join("\n");
  }

  if (lowerShell.includes("powershell") || lowerShell.includes("pwsh")) {
    return [
      "Session actuelle :",
      "",
      "```powershell",
      `$env:${envName}="votre-clé"`,
      "```",
      "",
      "Configuration utilisateur permanente :",
      "",
      "```powershell",
      "[Environment]::SetEnvironmentVariable(",
      `  "${envName}",`,
      '  "votre-clé",',
      '  "User"',
      ")",
      "```",
      "",
      RESTART_TERMINAL_NOTE,
    ].join("\n");
  }

  const rcFile = lowerShell.includes("bash") ? "~/.bashrc" : "~/.zshrc";
  return [
    "Session actuelle :",
    "",
    "```bash",
    `export ${envName}="votre-clé"`,
    "```",
    "",
    "Configuration permanente :",
    "",
    "```bash",
    `echo 'export ${envName}="votre-clé"' >> ${rcFile}`,
    "```",
    "",
    RESTART_TERMINAL_NOTE,
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
    showChanges: input.existing?.showChanges ?? DEFAULT_CONFIG.showChanges,
    showStats: input.existing?.showStats ?? DEFAULT_CONFIG.showStats,
    telemetry: false,
    providers: Object.keys(providers).length > 0 ? providers : undefined,
  });
}

export function buildSummary(config: Config, keyStatus: ApiKeyStatus): string {
  const maxOutputSummary =
    config.maxOutputTokens === undefined
      ? "adaptative"
      : `${String(config.maxOutputTokens)} tokens`;
  const lines = [
    "Configuration Reqraft",
    "",
    `Provider       ${providerLabel(config.defaultProvider)}`,
    `Modèle         ${config.defaultModel}`,
    `Clé API        ${formatKeySummary(keyStatus)}`,
    `Profil         ${config.defaultProfile}`,
    `Niveau         ${config.defaultLevel}`,
    `Copie auto.    ${config.copyAfterGeneration ? "oui" : "non"}`,
    `Streaming      ${config.stream ? "oui" : "non"}`,
    `Timeout        ${String(config.timeoutMs)} ms`,
    `Sortie max.    ${maxOutputSummary}`,
    `Stats          ${config.showStats ? "oui" : "non"}`,
    "Télémétrie     désactivée",
  ];

  const compatible = firstCompatibleProvider(config);
  if (compatible) {
    lines.splice(5, 0, `Base URL       ${compatible.baseUrl}`);
    lines.splice(6, 0, `Variable clé   ${compatible.apiKeyEnv ?? "aucune"}`);
    lines.splice(
      7,
      0,
      `Nom provider   ${compatible.name ?? getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label}`,
    );
  }

  return lines.join("\n");
}

export function buildPostInitSecurityNote(
  keyStatus: ApiKeyStatus,
  shell = process.env.SHELL ?? "",
): string {
  if (!keyStatus.envName || keyStatus.detected) {
    return "";
  }

  return [
    "Clé API à configurer",
    "",
    "La configuration est enregistrée, mais la connexion au provider nécessite encore une clé.",
    "Méthode recommandée, avec le coffre-fort sécurisé du système :",
    "",
    `rp auth login ${providerFromEnvName(keyStatus.envName)}`,
    "",
    "Alternative par variable d'environnement :",
    "",
    buildShellInstructions(keyStatus.envName, shell),
  ].join("\n");
}

/** Asks for confirmation before discarding an existing configuration. */
async function confirmOverwrite(io: InitIo, question: string): Promise<Config | null> {
  const confirmed = await askConfirm(io, question, false);
  if (!confirmed) {
    io.write(SETUP_CANCELLED);
    return null;
  }
  return DEFAULT_CONFIG;
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
    return await confirmOverwrite(
      io,
      "Une configuration Reqraft existe déjà. Confirmer l'écrasement avec les valeurs par défaut ?",
    );
  }

  const action = await askExistingConfigAction(io, existingConfig);
  if (action === "cancel") {
    io.write(SETUP_CANCELLED);
    return null;
  }
  if (action === "show") {
    io.write(`${JSON.stringify(existingConfig, null, 2)}\n`);
    return null;
  }
  if (action === "reset") {
    return await confirmOverwrite(io, "Confirmer l'écrasement de la configuration existante ?");
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

    io.write(`\n${buildSummary(config, keyStatus)}\n\n`);
    const decision = await askMenu(io, "Que souhaites-tu faire ?", [
      "Enregistrer la configuration",
      "Modifier un choix",
      "Annuler",
    ]);

    if (decision === 1) {
      continue;
    }
    if (decision === 2) {
      io.write(SETUP_CANCELLED);
      return;
    }

    await saveConfig(config);
    await verifySavedConfig(config, keyStatus, io);
    const securityNote = buildPostInitSecurityNote(keyStatus, shell);
    if (securityNote) {
      io.write(`\n${securityNote}\n`);
    }
    await maybeRunConnectionTest(config, keyStatus, io, env);
    return;
  }
}

export async function runFirstRunSetup(options: RunFirstRunOptions = {}): Promise<void> {
  const io = createIo(options.input ?? process.stdin, options.output ?? process.stdout);
  const env = options.env ?? process.env;
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
      return await askText(io, MODEL_ID_PROMPT, defaults.defaultModel || "local-model");
    }
    if (compatibleProvider.id === "custom") {
      return await askText(io, MODEL_ID_PROMPT, defaults.defaultModel);
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
    io.write(`${keyStatus.message}\n`);

    if (!keyStatus.detected && !keyStatus.optional) {
      const keyAction = await askMenu(io, "Comment souhaites-tu continuer ?", [
        "Afficher les instructions de configuration",
        "Continuer sans clé pour le moment",
        "Revenir au choix du provider",
      ]);
      if (keyAction === 0 && keyStatus.envName) {
        io.write(`\n${buildShellInstructions(keyStatus.envName, shell)}\n\n`);
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
        "Copier automatiquement le résultat dans le presse-papiers ?",
        defaults.copyAfterGeneration,
      ),
      stream: await askConfirm(
        io,
        "Afficher progressivement la réponse lorsque le provider le permet ?",
        defaults.stream,
      ),
      timeoutMs: await askTimeout(io, defaults.timeoutMs),
    };
  }
}

function writeIntro(io: InitIo): void {
  io.write("reqraft init\n");
  io.write("Configuration guidée\n");
  io.write("----------------------------------------\n\n");
  io.write("Configure ton provider, ton modèle et tes préférences locales.\n");
  io.write("Aucun prompt ni aucune clé API ne sera écrit dans config.json.\n\n");
}

async function askExistingConfigAction(
  io: InitIo,
  existingConfig: Config,
): Promise<"modify" | "reset" | "show" | "cancel"> {
  io.write("Une configuration Reqraft existe déjà.\n\n");
  const choice = await askMenu(io, "", [
    "Modifier la configuration existante",
    "Recommencer avec les valeurs par défaut",
    "Afficher la configuration",
    "Annuler",
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
  const choices = getInitProviderChoices();
  const defaultIndex = Math.max(
    choices.findIndex((choice) => choice.provider === defaults.defaultProvider),
    0,
  );
  const index = await askMenu(
    io,
    "Quel provider souhaites-tu utiliser ?",
    choices.map((choice) => choice.label),
    defaultIndex,
  );
  const fallback = choices[0];
  if (!fallback) {
    throw new Error("Aucun provider disponible.");
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
  const id = await askText(io, "Identifiant interne du provider", existing?.id ?? idDefault);
  const name = await askText(
    io,
    "Nom personnalisé du provider",
    existing?.name ??
      (local ? "Serveur local" : getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label),
  );
  const baseUrl = await askText(
    io,
    "Base URL",
    existing?.baseUrl ?? (local ? "http://localhost:11434/v1" : "https://example.com/v1"),
  );
  const apiKeyEnv = await askText(
    io,
    "Variable d'environnement contenant la clé (optionnelle)",
    existing?.apiKeyEnv ?? "",
  );
  const headersInput = await askText(io, "Headers personnalisés JSON (optionnel)", "");
  const customHeaders = parseHeaders(headersInput);
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
    return await askText(io, MODEL_ID_PROMPT, currentModel);
  }

  const recommended = presets.find((preset) => preset.recommended);
  const ordered = [
    ...(recommended ? [recommended] : []),
    ...presets.filter((preset) => preset.id !== recommended?.id),
  ];
  const labels = ordered.map((preset) => `${preset.name} (${preset.id}) - ${preset.description}`);
  labels.push("Saisir un identifiant manuellement");

  const index = await askMenu(io, "Quel modèle souhaites-tu utiliser ?", labels);
  if (index === labels.length - 1) {
    return await askText(io, MODEL_ID_PROMPT, currentModel);
  }
  return ordered[index]?.id ?? currentModel;
}

async function askProfile(io: InitIo, currentProfile: string): Promise<string> {
  const defaultIndex = Math.max(BUILTIN_PROFILES.indexOf(currentProfile), 0);
  const index = await askMenu(io, "Profil par défaut", BUILTIN_PROFILES, defaultIndex);
  return BUILTIN_PROFILES[index] ?? "auto";
}

async function askLevel(
  io: InitIo,
  currentLevel: Config["defaultLevel"],
): Promise<Config["defaultLevel"]> {
  const levels: Config["defaultLevel"][] = ["minimal", "standard", "complete"];
  const defaultIndex = Math.max(levels.indexOf(currentLevel), 1);
  const index = await askMenu(io, "Niveau", levels, defaultIndex);
  return levels[index] ?? "standard";
}

async function askTimeout(io: InitIo, currentTimeout: number): Promise<number> {
  for (;;) {
    const answer = await askText(
      io,
      "Timeout en millisecondes",
      String(currentTimeout > 0 ? currentTimeout : REPROMPT_POLICY.runtime.defaultTimeoutMs),
    );
    const timeout = Number(answer);
    if (Number.isInteger(timeout) && timeout > 0) {
      return timeout;
    }
    io.write("Le timeout doit être un entier strictement positif.\n");
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
    throw new Error("La configuration relue ne correspond pas aux choix enregistrés.");
  }

  io.write("\nConfiguration enregistrée avec succès.\n\n");
  io.write("Fichier :\n");
  io.write(`${configPath()}\n\n`);
  io.write(`Provider : ${providerLabel(saved.defaultProvider)}\n`);
  io.write(`Modèle   : ${saved.defaultModel}\n`);
  io.write(`Clé API  : ${keyStatus.detected ? "détectée" : "non détectée"}\n`);
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

  const wantsTest = await askConfirm(io, "Tester maintenant la connexion au provider ?", false);
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
    io.write(`Connexion réussie en ${String(Date.now() - startedAt)} ms.\n`);
  } catch (error) {
    io.write(`Test de connexion échoué : ${formatUiError(error, config.defaultProvider)}\n`);
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

function formatKeySummary(status: ApiKeyStatus): string {
  if (!status.envName) {
    return "facultative";
  }
  return status.detected
    ? `détectée dans ${status.envName}`
    : `non détectée dans ${status.envName}`;
}

function providerLabel(provider: Config["defaultProvider"]): string {
  return getProviderDefinition(provider).label;
}

function providerFromEnvName(envName: string): string {
  const match = listCredentialProviders().find(
    (definition) =>
      isCredentialProvider(definition.id) && getProviderEnvName(definition.id) === envName,
  );
  return match?.id ?? "openai";
}

function parseHeaders(input: string): Record<string, string> | undefined {
  if (!input.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Les headers personnalisés doivent être un objet JSON.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

interface InitIo {
  write(message: string): void;
  question(prompt: string): Promise<string>;
  close(): void;
}

function createIo(input: Readable, output: Writable): InitIo {
  const rl = readline.createInterface({ input, output });
  return {
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
    io.write(`${question}\n\n`);
  }
  for (const [index, choice] of choices.entries()) {
    io.write(`${index === defaultIndex ? "›" : " "} ${String(index + 1)}. ${choice}\n`);
  }
  io.write("\n");

  for (;;) {
    const answer = await io.question(`Votre choix (${String(defaultIndex + 1)}) : `);
    if (!answer) {
      return defaultIndex;
    }
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && index >= 0 && index < choices.length) {
      return index;
    }
    io.write("Choix invalide.\n");
  }
}

async function askConfirm(io: InitIo, question: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? "O/n" : "o/N";
  for (;;) {
    const answer = (await io.question(`${question} (${suffix}) : `)).toLowerCase();
    if (!answer) {
      return defaultValue;
    }
    if (["o", "oui", "y", "yes"].includes(answer)) {
      return true;
    }
    if (["n", "non", "no"].includes(answer)) {
      return false;
    }
    io.write("Réponds par oui ou non.\n");
  }
}

async function askText(io: InitIo, question: string, defaultValue: string): Promise<string> {
  const defaultHint = defaultValue ? ` (${defaultValue})` : "";
  const answer = await io.question(`${question}${defaultHint} : `);
  return answer ? answer : defaultValue;
}
