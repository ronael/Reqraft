export const UI_LOCALES = ["en", "fr"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export type UiLocalePreference = "auto" | UiLocale;

export interface LocaleResolutionInput {
  cli?: string;
  config?: string;
  env?: string;
  systemLocales?: readonly (string | undefined)[];
}

function parseExplicitPreference(value: string | undefined): UiLocalePreference | undefined {
  if (value === undefined) return undefined;
  if (value === "auto" || value === "en" || value === "fr") return value;
  throw new Error(`Invalid uiLocale: ${value}`);
}

export function normalizeSystemLocale(value: string | undefined): UiLocale | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^(?:c|posix)$/i.test(trimmed)) return undefined;

  const normalized = trimmed.split(".", 1)[0]?.split("@", 1)[0]?.replaceAll("_", "-");
  if (!normalized) return undefined;

  try {
    const [canonical] = Intl.getCanonicalLocales(normalized);
    const primary = canonical?.split("-", 1)[0]?.toLowerCase();
    return primary === "en" || primary === "fr" ? primary : undefined;
  } catch {
    return undefined;
  }
}

export function resolveUiLocale(input: LocaleResolutionInput): UiLocale {
  for (const value of [input.cli, input.config, input.env]) {
    const preference = parseExplicitPreference(value);
    if (preference && preference !== "auto") return preference;
  }

  for (const value of input.systemLocales ?? []) {
    const locale = normalizeSystemLocale(value);
    if (locale) return locale;
  }
  return "en";
}

export function systemLocaleCandidates(
  env: NodeJS.ProcessEnv = process.env,
  intlLocale = Intl.DateTimeFormat().resolvedOptions().locale,
): (string | undefined)[] {
  return [env.LC_ALL, env.LC_MESSAGES, env.LANG, intlLocale];
}

export function findUiLocalePreference(argv: readonly string[]): string | undefined {
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--ui-locale") return argv[index + 1];
    if (argument?.startsWith("--ui-locale=")) return argument.slice("--ui-locale=".length);
  }
  return undefined;
}
