import { credentialStatus, login, logout } from "@/auth/credentials.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { isCredentialProvider, type CredentialProvider } from "@/providers/catalog.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

interface AuthOutput {
  error(message: string): void;
}

interface AuthDependencies {
  output?: AuthOutput;
  credentialStatus?: () => Promise<void>;
  login?: (provider: CredentialProvider) => Promise<void>;
  logout?: (provider: CredentialProvider) => Promise<void>;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

export async function runAuth(
  action: string,
  provider: string | undefined,
  dependencies: AuthDependencies = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = dependencies.output ?? console;
  if (action === "status") {
    await (dependencies.credentialStatus ?? (() => credentialStatus({}, t)))();
    return EXIT_CODES.SUCCESS;
  }

  if (!provider || !isCredentialProvider(provider)) {
    output.error(t("auth.invalidProvider"));
    return EXIT_CODES.INVALID_INPUT;
  }

  if (action === "login") {
    await (dependencies.login ?? ((id) => login(id, {}, t)))(provider);
    return EXIT_CODES.SUCCESS;
  }

  if (action === "logout") {
    await (dependencies.logout ?? ((id) => logout(id, {}, t)))(provider);
    return EXIT_CODES.SUCCESS;
  }

  output.error(t("auth.invalidAction"));
  return EXIT_CODES.INVALID_INPUT;
}
