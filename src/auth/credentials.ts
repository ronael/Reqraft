import process from "node:process";
import readline from "node:readline";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createProvider } from "@/providers/registry.js";
import { printScreen } from "@/ui/text.js";
import { REPROMPT_POLICY } from "@/core/reprompt-policy.js";
import {
  type CredentialProvider,
  getProviderEnvName,
  listCredentialProviders,
} from "@/providers/catalog.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TRANSLATOR = createTranslator("fr");

/** Linux Secret Service CLI, and the attribute pair identifying a Reqraft key. */
const SECRET_TOOL = "secret-tool";
const SECRET_TOOL_KEYS = ["service", "reqraft", "provider"] as const;

const PLACEHOLDER_CREDENTIALS = new Set([
  "ta-cle",
  "ta-clé",
  "votre-cle",
  "votre-clé",
  "your-api-key",
  "api-key",
]);

export async function hydrateCredentials(env: NodeJS.ProcessEnv): Promise<void> {
  assertEnvironmentCredentials(env);
  for (const { id: provider } of listCredentialProviders()) {
    const envName = getProviderEnvName(provider);
    const envCredential = env[envName];
    if (!envCredential) {
      const secret = await getCredential(provider);
      if (secret) env[envName] = secret;
    }
  }
}

interface CredentialOutput {
  log(message: string): void;
}

interface CredentialLoginOutput extends CredentialOutput {
  write(message: string): void;
}

interface LoginDependencies {
  env?: NodeJS.ProcessEnv;
  output?: CredentialLoginOutput;
  readSecret?: (question: string) => Promise<string>;
  validateCredential?: (provider: CredentialProvider, secret: string) => Promise<void>;
  setCredential?: (provider: CredentialProvider, secret: string) => Promise<void>;
}

interface LogoutDependencies {
  output?: CredentialOutput;
  deleteCredential?: (provider: CredentialProvider) => Promise<void>;
}

export async function login(
  provider: CredentialProvider,
  dependencies: LoginDependencies = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<void> {
  const output = dependencies.output ?? {
    log: console.log,
    write: process.stdout.write.bind(process.stdout),
  };
  const env = dependencies.env ?? process.env;
  printScreen(t("auth.login.title", { provider }), t("auth.login.subtitle"), output);
  output.log(t("auth.login.configNote"));
  const secret = await (dependencies.readSecret ?? readSecret)(
    t("auth.login.prompt", { provider }),
  );
  if (!secret) throw new Error(t("auth.login.missing"));
  assertCredentialIsNotPlaceholder(secret);
  output.write(t("auth.login.checking"));
  await (dependencies.validateCredential ?? validateCredential)(provider, secret);
  output.log(t("auth.login.valid"));
  try {
    await (dependencies.setCredential ?? setCredential)(provider, secret);
  } catch (error) {
    throw new ReqraftError("credential.storage_unavailable", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { provider },
      cause: error,
    });
  }
  output.log(t("auth.login.saved", { provider }));
  const envName = getProviderEnvName(provider);
  if (env[envName]) {
    output.log(t("auth.login.envPriority", { envName }));
    output.log(t("auth.login.envAdvice"));
  }
}

export async function logout(
  provider: CredentialProvider,
  dependencies: LogoutDependencies = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<void> {
  const output = dependencies.output ?? console;
  try {
    await (dependencies.deleteCredential ?? deleteCredential)(provider);
  } catch (error) {
    throw new ReqraftError("credential.storage_unavailable", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { provider },
      cause: error,
    });
  }
  output.log(t("auth.logout.done", { provider }));
}

/**
 * Describes where a provider key comes from, honouring the documented
 * precedence: an environment variable always wins over secure storage.
 */
async function describeCredentialSource(
  provider: CredentialProvider,
  envCredential: string | undefined,
  readCredential: (provider: CredentialProvider) => Promise<string | undefined> = getCredential,
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<string> {
  if (envCredential) {
    return isPlaceholderCredential(envCredential)
      ? t("auth.source.invalidEnvironment")
      : t("auth.source.environment");
  }
  return (await readCredential(provider))
    ? t("auth.source.secureStorage")
    : t("auth.source.notConfigured");
}

interface CredentialStatusDependencies {
  env?: NodeJS.ProcessEnv;
  output?: CredentialOutput;
  readCredential?: (provider: CredentialProvider) => Promise<string | undefined>;
}

export async function credentialStatus(
  dependencies: CredentialStatusDependencies = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<void> {
  const env = dependencies.env ?? process.env;
  const output = dependencies.output ?? console;
  const readCredential = dependencies.readCredential ?? getCredential;
  printScreen(t("auth.status.title"), t("auth.status.subtitle"), output);
  for (const { id: provider } of listCredentialProviders()) {
    const envCredential = env[getProviderEnvName(provider)];
    const source = await describeCredentialSource(provider, envCredential, readCredential, t);
    output.log(`${provider.padEnd(10)} ${source}`);
  }
}

export function assertCredentialIsNotPlaceholder(secret: string): void {
  if (isPlaceholderCredential(secret)) {
    throw new ReqraftError("credential.placeholder", EXIT_CODES.INVALID_CONFIGURATION);
  }
}

export function assertEnvironmentCredentials(env: NodeJS.ProcessEnv): void {
  for (const { id: provider } of listCredentialProviders()) {
    const envName = getProviderEnvName(provider);
    const secret = env[envName];
    if (secret && isPlaceholderCredential(secret)) {
      throw new ReqraftError("credential.placeholder", EXIT_CODES.INVALID_CONFIGURATION, {
        params: { envName },
      });
    }
  }
}

function isPlaceholderCredential(secret: string): boolean {
  return PLACEHOLDER_CREDENTIALS.has(secret.trim().toLowerCase());
}

async function validateCredential(provider: CredentialProvider, secret: string): Promise<void> {
  const envName = getProviderEnvName(provider);
  const adapter = createProvider(provider, { [envName]: secret });
  if (!adapter.listModels) {
    throw new Error(`Le provider ${provider} ne permet pas de vérifier la clé.`);
  }
  await adapter.listModels(AbortSignal.timeout(REPROMPT_POLICY.runtime.connectionCheckTimeoutMs));
}

function service(provider: CredentialProvider): string {
  return `reqraft:${provider}`;
}

async function getCredential(provider: CredentialProvider): Promise<string | undefined> {
  try {
    if (process.platform === "darwin")
      return (
        await execFileAsync("security", ["find-generic-password", "-s", service(provider), "-w"])
      ).stdout.trim();
    if (process.platform === "linux")
      return (
        await execFileAsync(SECRET_TOOL, ["lookup", ...SECRET_TOOL_KEYS, provider])
      ).stdout.trim();
  } catch {
    return undefined;
  }
  return undefined;
}

async function setCredential(provider: CredentialProvider, secret: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      service(provider),
      "-a",
      "reqraft",
      "-w",
      secret,
    ]);
    return;
  }
  if (process.platform === "linux") {
    await storeLinuxCredential(provider, secret);
    return;
  }
  throw new Error(
    "Le stockage sécurisé Windows n'est pas encore disponible. Utilise une variable d'environnement.",
  );
}

async function storeLinuxCredential(provider: CredentialProvider, secret: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // sonarjs/no-os-command-from-path is disabled here on purpose.
    // `secret-tool` is the Secret Service CLI and has no stable absolute path:
    // it lives outside /usr/bin on Nix, Homebrew and several distributions, so
    // pinning one would break legitimate installs. It also buys no security
    // boundary — `rp` is itself resolved from the same PATH, so an attacker who
    // controls it has already won before this line runs. The command name is a
    // fixed literal; no part of it comes from user input.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const child = spawn(SECRET_TOOL, [
      "store",
      "--label=Reqraft API key",
      ...SECRET_TOOL_KEYS,
      provider,
    ]);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("secret-tool n'a pas pu enregistrer la clé."));
    });
    child.stdin.end(secret);
  });
}

async function deleteCredential(provider: CredentialProvider): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("security", ["delete-generic-password", "-s", service(provider)]);
    return;
  }
  if (process.platform === "linux") {
    await execFileAsync(SECRET_TOOL, ["clear", ...SECRET_TOOL_KEYS, provider]);
    return;
  }
  throw new Error("Le stockage sécurisé Windows n'est pas encore disponible.");
}

async function readSecret(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const original = (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput;
  let promptWritten = false;
  (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput = (value) => {
    if (!promptWritten && value === question) {
      promptWritten = true;
      process.stdout.write(value);
    }
    // Hide secret input after the prompt.
  };
  const answer = await new Promise<string>((resolve) => {
    rl.question(question, resolve);
  });
  (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput = original;
  rl.close();
  process.stdout.write("\n");
  return answer.trim();
}
