import process from "node:process";
import readline from "node:readline";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROVIDER_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
} as const;

export type CredentialProvider = keyof typeof PROVIDER_ENV;

export async function hydrateCredentials(env: NodeJS.ProcessEnv): Promise<void> {
  for (const provider of Object.keys(PROVIDER_ENV) as CredentialProvider[]) {
    const envName = PROVIDER_ENV[provider];
    if (!env[envName]) {
      const secret = await getCredential(provider);
      if (secret) env[envName] = secret;
    }
  }
}

export async function login(provider: CredentialProvider): Promise<void> {
  console.log(`\nConnexion sécurisée à ${provider}`);
  console.log("La clé sera stockée dans le coffre-fort du système, jamais dans config.json.\n");
  const secret = await readSecret(`Clé API ${provider} (saisie masquée) : `);
  if (!secret) throw new Error("Aucune clé fournie.");
  await setCredential(provider, secret);
  console.log(`Clé ${provider} enregistrée dans le stockage sécurisé du système.`);
}

export async function logout(provider: CredentialProvider): Promise<void> {
  await deleteCredential(provider);
  console.log(`Clé ${provider} supprimée du stockage sécurisé.`);
}

export async function credentialStatus(): Promise<void> {
  for (const provider of Object.keys(PROVIDER_ENV) as CredentialProvider[]) {
    const source = process.env[PROVIDER_ENV[provider]] ? "variable d'environnement" : (await getCredential(provider)) ? "stockage sécurisé" : "non configurée";
    console.log(`${provider.padEnd(10)} ${source}`);
  }
}

function service(provider: CredentialProvider): string { return `reqraft:${provider}`; }

async function getCredential(provider: CredentialProvider): Promise<string | undefined> {
  try {
    if (process.platform === "darwin") return (await execFileAsync("security", ["find-generic-password", "-s", service(provider), "-w"])).stdout.trim();
    if (process.platform === "linux") return (await execFileAsync("secret-tool", ["lookup", "service", "reqraft", "provider", provider])).stdout.trim();
  } catch { return undefined; }
  return undefined;
}

async function setCredential(provider: CredentialProvider, secret: string): Promise<void> {
  if (process.platform === "darwin") { await execFileAsync("security", ["add-generic-password", "-U", "-s", service(provider), "-a", "reqraft", "-w", secret]); return; }
  if (process.platform === "linux") { await storeLinuxCredential(provider, secret); return; }
  throw new Error("Le stockage sécurisé Windows n'est pas encore disponible. Utilise une variable d'environnement.");
}

async function storeLinuxCredential(provider: CredentialProvider, secret: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("secret-tool", ["store", "--label=Reqraft API key", "service", "reqraft", "provider", provider]);
    child.once("error", reject);
    child.once("close", (code) => { if (code === 0) resolve(); else reject(new Error("secret-tool n'a pas pu enregistrer la clé.")); });
    child.stdin.end(secret);
  });
}

async function deleteCredential(provider: CredentialProvider): Promise<void> {
  if (process.platform === "darwin") { await execFileAsync("security", ["delete-generic-password", "-s", service(provider)]); return; }
  if (process.platform === "linux") { await execFileAsync("secret-tool", ["clear", "service", "reqraft", "provider", provider]); return; }
  throw new Error("Le stockage sécurisé Windows n'est pas encore disponible.");
}

async function readSecret(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const original = (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput;
  let promptWritten = false;
  (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput = (value) => {
    if (!promptWritten && value === question) {
      promptWritten = true;
      process.stdout.write(value);
    }
    // Hide secret input after the prompt.
  };
  const answer = await new Promise<string>((resolve) => { rl.question(question, resolve); });
  (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput = original;
  rl.close();
  process.stdout.write("\n");
  return answer.trim();
}
