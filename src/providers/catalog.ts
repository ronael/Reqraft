const OPENAI_COMPATIBLE_ID = "openai-compatible";

export const BUILTIN_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "deepseek",
  "mistral",
  OPENAI_COMPATIBLE_ID,
  "mock",
] as const;

export type BuiltinProvider = (typeof BUILTIN_PROVIDER_IDS)[number];
export const OPENAI_COMPATIBLE_PROVIDER_ID = OPENAI_COMPATIBLE_ID satisfies BuiltinProvider;
export const DEFAULT_PROVIDER_ID = "anthropic" satisfies BuiltinProvider;

export interface ProviderDefinition {
  id: BuiltinProvider;
  label: string;
  apiKeyEnvName?: string;
  visibleInInit: boolean;
  supportsSecureAuth: boolean;
  requiresApiKey: boolean;
  isCustom: boolean;
  isLocal: boolean;
  isTest: boolean;
}

export const PROVIDER_DEFINITIONS = [
  {
    id: "anthropic",
    label: "Anthropic",
    apiKeyEnvName: "ANTHROPIC_API_KEY",
    visibleInInit: true,
    supportsSecureAuth: true,
    requiresApiKey: true,
    isCustom: false,
    isLocal: false,
    isTest: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKeyEnvName: "OPENAI_API_KEY",
    visibleInInit: true,
    supportsSecureAuth: true,
    requiresApiKey: true,
    isCustom: false,
    isLocal: false,
    isTest: false,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnvName: "DEEPSEEK_API_KEY",
    visibleInInit: true,
    supportsSecureAuth: true,
    requiresApiKey: true,
    isCustom: false,
    isLocal: false,
    isTest: false,
  },
  {
    id: "mistral",
    label: "Mistral",
    apiKeyEnvName: "MISTRAL_API_KEY",
    visibleInInit: true,
    supportsSecureAuth: true,
    requiresApiKey: true,
    isCustom: false,
    isLocal: false,
    isTest: false,
  },
  {
    id: OPENAI_COMPATIBLE_PROVIDER_ID,
    label: "OpenAI Compatible",
    visibleInInit: true,
    supportsSecureAuth: false,
    requiresApiKey: false,
    isCustom: true,
    isLocal: false,
    isTest: false,
  },
  {
    id: "mock",
    label: "Mock",
    visibleInInit: false,
    supportsSecureAuth: false,
    requiresApiKey: false,
    isCustom: false,
    isLocal: false,
    isTest: true,
  },
] as const satisfies readonly ProviderDefinition[];

export type CredentialProvider = Extract<
  (typeof PROVIDER_DEFINITIONS)[number],
  { supportsSecureAuth: true; requiresApiKey: true }
>["id"];
export const CREDENTIAL_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "deepseek",
  "mistral",
] as const satisfies readonly CredentialProvider[];
export type InitProvider = Extract<
  (typeof PROVIDER_DEFINITIONS)[number],
  { visibleInInit: true }
>["id"];

export type CredentialProviderDefinition = Extract<
  (typeof PROVIDER_DEFINITIONS)[number],
  { supportsSecureAuth: true; requiresApiKey: true }
>;

const PROVIDER_DEFINITION_BY_ID: Record<BuiltinProvider, ProviderDefinition> = Object.fromEntries(
  PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<BuiltinProvider, ProviderDefinition>;

export function listProviderDefinitions(): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function getProviderDefinition(id: BuiltinProvider): ProviderDefinition {
  return PROVIDER_DEFINITION_BY_ID[id];
}

export function listCredentialProviders(): CredentialProviderDefinition[] {
  return listProviderDefinitions().filter(
    (definition): definition is CredentialProviderDefinition =>
      definition.supportsSecureAuth && Boolean(definition.apiKeyEnvName),
  );
}

export function getProviderEnvName(provider: CredentialProvider): string {
  const envName = getProviderDefinition(provider).apiKeyEnvName;
  if (!envName) {
    throw new Error(`Provider sans variable d'environnement : ${provider}`);
  }
  return envName;
}

export function isBuiltinProvider(value: string): value is BuiltinProvider {
  return BUILTIN_PROVIDER_IDS.includes(value as BuiltinProvider);
}

export function isCredentialProvider(value: string): value is CredentialProvider {
  return isBuiltinProvider(value) && getProviderDefinition(value).supportsSecureAuth;
}
