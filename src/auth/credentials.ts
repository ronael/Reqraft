import process from "node:process";
import readline from "node:readline";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createProvider } from "../providers/registry.js";
import { printScreen } from "../ui/text.js";
import { REPROMPT_POLICY } from "../core/reprompt-policy.js";

const execFileAsync = promisify(execFile);

const PROVIDER_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
} as const;

export type CredentialProvider = keyof typeof PROVIDER_ENV;

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
  for (const provider of Object.keys(PROVIDER_ENV) as CredentialProvider[]) {
    const envName = PROVIDER_ENV[provider];
    const envCredential = env[envName];
    if (!envCredential) {
      const secret = await getCredential(provider);
      if (secret) env[envName] = secret;
    }
  }
}

export async function login(provider: CredentialProvider): Promise<void> {
  printScreen(`Connexion à ${provider}`, "Stockage sécurisé du système");
  console.log("La clé ne sera jamais écrite dans config.json.\n");
  const secret = await readSecret(`Clé API ${provider} (saisie masquée) : `);
  if (!secret) throw new Error("Aucune clé fournie.");
  assertCredentialIsNotPlaceholder(secret);
  process.stdout.write("Vérification de la clé… ");
  await validateCredential(provider, secret);
  console.log("valide.");
  await setCredential(provider, secret);
  console.log(`Clé ${provider} enregistrée dans le stockage sécurisé du système.`);
  const envName = PROVIDER_ENV[provider];
  if (process.env[envName]) {
    console.log(
      `Attention : ${envName} est déjà définie et reste prioritaire sur le stockage sécurisé.`,
    );
    console.log(
      `Supprime cette variable si elle contient une ancienne clé, puis relance ton terminal.`,
    );
  }
}

export async function logout(provider: CredentialProvider): Promise<void> {
  await deleteCredential(provider);
  console.log(`Clé ${provider} supprimée du stockage sécurisé.`);
}

export async function credentialStatus(): Promise<void> {
  printScreen("Clés API", "Source active pour chaque provider");
  for (const provider of Object.keys(PROVIDER_ENV) as CredentialProvider[]) {
    const envCredential = process.env[PROVIDER_ENV[provider]];
    const source = envCredential
      ? isPlaceholderCredential(envCredential)
        ? "variable d'environnement invalide (valeur d'exemple)"
        : "variable d'environnement"
      : (await getCredential(provider))
        ? "stockage sécurisé"
        : "non configurée";
    console.log(`${provider.padEnd(10)} ${source}`);
  }
}

export function assertCredentialIsNotPlaceholder(secret: string): void {
  if (isPlaceholderCredential(secret)) {
    throw new Error("Cette valeur ressemble à un exemple, pas à une véritable clé API.");
  }
}

export function assertEnvironmentCredentials(env: NodeJS.ProcessEnv): void {
  for (const envName of Object.values(PROVIDER_ENV)) {
    const secret = env[envName];
    if (secret && isPlaceholderCredential(secret)) {
      throw new Error(
        `${envName} contient une valeur d’exemple invalide. Corrige-la ou supprime-la avant de relancer Reqraft.`,
      );
    }
  }
}

function isPlaceholderCredential(secret: string): boolean {
  return PLACEHOLDER_CREDENTIALS.has(secret.trim().toLowerCase());
}

async function validateCredential(provider: CredentialProvider, secret: string): Promise<void> {
  const envName = PROVIDER_ENV[provider];
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
        await execFileAsync("secret-tool", ["lookup", "service", "reqraft", "provider", provider])
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
    const child = spawn("secret-tool", [
      "store",
      "--label=Reqraft API key",
      "service",
      "reqraft",
      "provider",
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
    await execFileAsync("secret-tool", ["clear", "service", "reqraft", "provider", provider]);
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
