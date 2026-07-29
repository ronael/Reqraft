import { credentialStatus, login, logout } from "../auth/credentials.js";
import { EXIT_CODES } from "../utils/exit-codes.js";
import { isCredentialProvider, type CredentialProvider } from "../providers/catalog.js";

interface AuthOutput {
  error(message: string): void;
}

interface AuthDependencies {
  output?: AuthOutput;
  credentialStatus?: () => Promise<void>;
  login?: (provider: CredentialProvider) => Promise<void>;
  logout?: (provider: CredentialProvider) => Promise<void>;
}

export async function runAuth(
  action: string,
  provider: string | undefined,
  dependencies: AuthDependencies = {},
): Promise<number> {
  const output = dependencies.output ?? console;
  if (action === "status") {
    await (dependencies.credentialStatus ?? credentialStatus)();
    return EXIT_CODES.SUCCESS;
  }

  if (!provider || !isCredentialProvider(provider)) {
    output.error("Provider invalide.");
    return EXIT_CODES.INVALID_INPUT;
  }

  if (action === "login") {
    await (dependencies.login ?? login)(provider);
    return EXIT_CODES.SUCCESS;
  }

  if (action === "logout") {
    await (dependencies.logout ?? logout)(provider);
    return EXIT_CODES.SUCCESS;
  }

  output.error("Action invalide : login, logout ou status.");
  return EXIT_CODES.INVALID_INPUT;
}
