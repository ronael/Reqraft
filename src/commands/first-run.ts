import process from "node:process";
import readline from "node:readline";
import { existsSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { ConfigSchema, type Config } from "../config/schema.js";
import { configPath, loadConfig, saveConfig, DEFAULT_CONFIG } from "../config/loader.js";
import { getPresetModels } from "../models/presets.js";
import { createProvider } from "../providers/registry.js";

type InitProvider = Exclude<Config["defaultProvider"], "mock">;

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

const PROVIDER_ENV: Partial<Record<InitProvider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

const PROVIDER_LABEL: Record<InitProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  "openai-compatible": "OpenAI Compatible",
};

export function getInitProviderChoices(): InitProviderChoice[] {
  return [
    { label: "Anthropic", provider: "anthropic" },
    { label: "OpenAI", provider: "openai" },
    { label: "DeepSeek", provider: "deepseek" },
    { label: "Mistral", provider: "mistral" },
    { label: "OpenAI Compatible", provider: "openai-compatible" },
    { label: "Serveur local compatible OpenAI", provider: "openai-compatible", local: true },
  ];
}

export function buildApiKeyStatus(
  provider: InitProvider,
  env: NodeJS.ProcessEnv,
  apiKeyEnv?: string,
): ApiKeyStatus {
  const envName = apiKeyEnv ?? PROVIDER_ENV[provider];
  const optional = provider === "openai-compatible";
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
      "Relance ton terminal pour une configuration permanente.",
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
      "Relance ton terminal pour une configuration permanente.",
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
    "Relance ton terminal pour une configuration permanente.",
  ].join("\n");
}

export function createInitConfig(input: InitConfigInput): Config {
  const providers = { ...(input.existing?.providers ?? {}) };
  if (input.compatibleProvider) {
    providers[input.compatibleProvider.id] = {
      type: "openai-compatible",
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
    `Stats          ${config.showStats ? "oui" : "non"}`,
    "Télémétrie     désactivée",
  ];

  const compatible = firstCompatibleProvider(config);
  if (compatible) {
    lines.splice(5, 0, `Base URL       ${compatible.baseUrl}`);
    lines.splice(6, 0, `Variable clé   ${compatible.apiKeyEnv ?? "aucune"}`);
    lines.splice(7, 0, `Nom provider   ${compatible.name ?? "OpenAI Compatible"}`);
  }

  return lines.join("\n");
}

export function buildPostInitSecurityNote(keyStatus: ApiKeyStatus, shell = process.env.SHELL ?? ""): string {
  if (!keyStatus.envName || keyStatus.detected) {
    return "";
  }

  return [
    "Note sécurité",
    "",
    "Reqraft ne t'a pas demandé ta clé API pendant l'initialisation.",
    "Pour éviter de stocker un secret en clair, ajoute-la via une variable d'environnement.",
    "",
    buildShellInstructions(keyStatus.envName, shell),
  ].join("\n");
}

export async function runFirstRunSetup(options: RunFirstRunOptions = {}): Promise<void> {
  const io = createIo(options.input ?? process.stdin, options.output ?? process.stdout);
  const env = options.env ?? process.env;
  const shell = options.shell ?? process.env.SHELL ?? "";

  try {
    const pathToConfig = configPath();
    const hasExistingConfig = existsSync(pathToConfig);
    const existingConfig = hasExistingConfig ? await loadConfig() : undefined;
    let baseConfig = options.reset ? DEFAULT_CONFIG : (existingConfig ?? DEFAULT_CONFIG);

    if (hasExistingConfig && options.reset) {
      writeIntro(io);
      const confirmed = await askConfirm(
        io,
        "Une configuration Reqraft existe déjà. Confirmer l'écrasement avec les valeurs par défaut ?",
        false,
      );
      if (!confirmed) {
        io.write("Initialisation annulée.\n");
        return;
      }
      baseConfig = DEFAULT_CONFIG;
    } else if (hasExistingConfig) {
      if (!existingConfig) {
        throw new Error("Configuration existante introuvable.");
      }
      const action = await askExistingConfigAction(io, existingConfig);
      if (action === "cancel") {
        io.write("Initialisation annulée.\n");
        return;
      }
      if (action === "show") {
        io.write(`${JSON.stringify(existingConfig, null, 2)}\n`);
        return;
      }
      if (action === "reset") {
        const confirmed = await askConfirm(io, "Confirmer l'écrasement de la configuration existante ?", false);
        if (!confirmed) {
          io.write("Initialisation annulée.\n");
          return;
        }
        baseConfig = DEFAULT_CONFIG;
      }
    } else {
      writeIntro(io);
    }

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
        io.write("Initialisation annulée.\n");
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
  } finally {
    io.close();
  }
}

async function collectConfig(
  io: InitIo,
  defaults: Config,
  env: NodeJS.ProcessEnv,
  shell: string,
): Promise<Omit<InitConfigInput, "existing">> {
  for (;;) {
    const providerChoice = await askProvider(io, defaults);
    const compatibleProvider = providerChoice.provider === "openai-compatible"
      ? await askCompatibleProvider(io, defaults, providerChoice.local)
      : undefined;
    const keyStatus = buildApiKeyStatus(providerChoice.provider, env, compatibleProvider?.apiKeyEnv);
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

    const model = compatibleProvider?.baseUrl
      ? compatibleProvider.id === "local"
        ? await askText(io, "Identifiant du modèle", defaults.defaultModel || "local-model")
        : compatibleProvider.id === "custom"
          ? await askText(io, "Identifiant du modèle", defaults.defaultModel)
          : await askModel(io, providerChoice.provider, defaults.defaultModel)
      : await askModel(io, providerChoice.provider, defaults.defaultModel);

    return {
      provider: providerChoice.provider,
      compatibleProvider,
      model,
      profile: await askProfile(io, defaults.defaultProfile),
      level: await askLevel(io, defaults.defaultLevel),
      copyAfterGeneration: await askConfirm(io, "Copier automatiquement le résultat dans le presse-papiers ?", defaults.copyAfterGeneration),
      stream: await askConfirm(io, "Afficher progressivement la réponse lorsque le provider le permet ?", defaults.stream),
      timeoutMs: await askTimeout(io, defaults.timeoutMs),
    };
  }
}

function writeIntro(io: InitIo): void {
  io.write("Bienvenue dans Reqraft.\n\n");
  io.write("Cet assistant va configurer ton provider, ton modèle et tes préférences locales.\n");
  io.write("Aucun prompt n'est conservé et aucune clé API ne sera enregistrée dans config.json.\n\n");
}

async function askExistingConfigAction(io: InitIo, existingConfig: Config): Promise<"modify" | "reset" | "show" | "cancel"> {
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
  const index = await askMenu(io, "Quel provider souhaites-tu utiliser ?", choices.map((choice) => choice.label), defaultIndex);
  const fallback = choices[0];
  if (!fallback) {
    throw new Error("Aucun provider disponible.");
  }
  return choices[index] ?? fallback;
}

async function askCompatibleProvider(
  io: InitIo,
  defaults: Config,
  local?: boolean,
): Promise<CompatibleProviderInput> {
  const existing = firstCompatibleProvider(defaults);
  const idDefault = local ? "local" : "custom";
  const id = await askText(io, "Identifiant interne du provider", existing?.id ?? idDefault);
  const name = await askText(io, "Nom personnalisé du provider", existing?.name ?? (local ? "Serveur local" : "OpenAI Compatible"));
  const baseUrl = await askText(
    io,
    "Base URL",
    existing?.baseUrl ?? (local ? "http://localhost:11434/v1" : "https://example.com/v1"),
  );
  const apiKeyEnv = await askText(io, "Variable d'environnement contenant la clé (optionnelle)", existing?.apiKeyEnv ?? "");
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
    return await askText(io, "Identifiant du modèle", currentModel);
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
    return await askText(io, "Identifiant du modèle", currentModel);
  }
  return ordered[index]?.id ?? currentModel;
}

async function askProfile(io: InitIo, currentProfile: string): Promise<string> {
  const defaultIndex = Math.max(BUILTIN_PROFILES.indexOf(currentProfile), 0);
  const index = await askMenu(io, "Profil par défaut", BUILTIN_PROFILES, defaultIndex);
  return BUILTIN_PROFILES[index] ?? "auto";
}

async function askLevel(io: InitIo, currentLevel: Config["defaultLevel"]): Promise<Config["defaultLevel"]> {
  const levels: Config["defaultLevel"][] = ["minimal", "standard", "complete"];
  const defaultIndex = Math.max(levels.indexOf(currentLevel), 1);
  const index = await askMenu(io, "Niveau", levels, defaultIndex);
  return levels[index] ?? "standard";
}

async function askTimeout(io: InitIo, currentTimeout: number): Promise<number> {
  for (;;) {
    const answer = await askText(io, "Timeout en millisecondes", String(currentTimeout > 0 ? currentTimeout : 30000));
    const timeout = Number(answer);
    if (Number.isInteger(timeout) && timeout > 0) {
      return timeout;
    }
    io.write("Le timeout doit être un entier strictement positif.\n");
  }
}

async function verifySavedConfig(expected: Config, keyStatus: ApiKeyStatus, io: InitIo): Promise<void> {
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
  if (!keyStatus.detected && config.defaultProvider !== "openai-compatible") {
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
      temperature: 0,
      maxOutputTokens: 16,
      stream: false,
    });
    io.write(`Connexion réussie en ${String(Date.now() - startedAt)} ms.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("auth") || message.includes("401") || message.includes("403")) {
      io.write("Authentification refusée.\n");
      if (keyStatus.envName) {
        io.write(`Vérifie la variable ${keyStatus.envName} puis relance \`rp doctor\`.\n`);
      }
      return;
    }
    io.write(`Test de connexion échoué : ${message}\n`);
  }
}

function firstCompatibleProvider(config: Config): (CompatibleProviderInput & { id: string }) | undefined {
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
  return provider === "mock" ? "mock" : PROVIDER_LABEL[provider];
}

function parseHeaders(input: string): Record<string, string> | undefined {
  if (!input.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Les headers personnalisés doivent être un objet JSON.");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
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
  const answer = await io.question(`${question}${defaultValue ? ` (${defaultValue})` : ""} : `);
  return answer ? answer : defaultValue;
}
