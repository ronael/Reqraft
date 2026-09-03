import { z } from "zod";

export const NPM_PACKAGE_URL = "https://www.npmjs.com/package/@reqraft/cli";
export const DESKTOP_RELEASES_URL = "https://github.com/ronael/Reqraft/releases/latest";

const NPM_LATEST_ENDPOINT = "https://registry.npmjs.org/@reqraft%2fcli/latest";
const GITHUB_LATEST_RELEASE_ENDPOINT =
  "https://api.github.com/repos/ronael/Reqraft/releases/latest";

const NpmLatestSchema = z.object({ version: z.string() });
const GitHubReleaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.hostname === "github.com" && url.pathname.startsWith("/ronael/Reqraft/releases/");
  });
const GitHubLatestReleaseSchema = z.object({
  tag_name: z.string(),
  html_url: GitHubReleaseUrlSchema,
  published_at: z.string().optional(),
});

interface JsonResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type UpdateFetcher = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<JsonResponse>;

export interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  url: string;
  publishedAt?: string;
}

interface CheckDependencies {
  fetcher?: UpdateFetcher;
  signal?: AbortSignal;
}

export async function checkNpmUpdate(
  currentVersion: string,
  dependencies: CheckDependencies = {},
): Promise<AvailableUpdate> {
  const payload = NpmLatestSchema.parse(
    await requestJson(NPM_LATEST_ENDPOINT, dependencies, {
      Accept: "application/json",
    }),
  );
  return {
    currentVersion,
    latestVersion: payload.version,
    available: isVersionNewer(payload.version, currentVersion),
    url: NPM_PACKAGE_URL,
  };
}

export async function checkDesktopUpdate(
  currentVersion: string,
  dependencies: CheckDependencies = {},
): Promise<AvailableUpdate> {
  const payload = GitHubLatestReleaseSchema.parse(
    await requestJson(GITHUB_LATEST_RELEASE_ENDPOINT, dependencies, {
      Accept: "application/vnd.github+json",
      "User-Agent": `Reqraft/${currentVersion}`,
      "X-GitHub-Api-Version": "2022-11-28",
    }),
  );
  const latestVersion = payload.tag_name.replace(/^v/, "");
  return {
    currentVersion,
    latestVersion,
    available: isVersionNewer(latestVersion, currentVersion),
    url: payload.html_url,
    ...(payload.published_at === undefined ? {} : { publishedAt: payload.published_at }),
  };
}

async function requestJson(
  url: string,
  dependencies: CheckDependencies,
  headers: Record<string, string>,
): Promise<unknown> {
  const fetcher = dependencies.fetcher ?? fetch;
  const response = await fetcher(url, {
    headers,
    signal: dependencies.signal ?? AbortSignal.timeout(2_500),
  });
  if (!response.ok) {
    throw new Error(`Update check failed with HTTP ${String(response.status)}.`);
  }
  return await response.json();
}

interface ParsedVersion {
  core: readonly [number, number, number];
  prerelease: readonly string[];
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  for (let index = 0; index < next.core.length; index += 1) {
    const difference = (next.core[index] ?? 0) - (installed.core[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return comparePrerelease(next.prerelease, installed.prerelease) > 0;
}

function parseVersion(value: string): ParsedVersion {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value.trim(),
  );
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(candidate: readonly string[], current: readonly string[]): number {
  if (candidate.length === 0 && current.length === 0) return 0;
  if (candidate.length === 0) return 1;
  if (current.length === 0) return -1;
  const length = Math.max(candidate.length, current.length);
  for (let index = 0; index < length; index += 1) {
    const next = candidate[index];
    const installed = current[index];
    if (next === undefined) return -1;
    if (installed === undefined) return 1;
    if (next !== installed) return comparePrereleaseIdentifier(next, installed);
  }
  return 0;
}

function comparePrereleaseIdentifier(candidate: string, current: string): number {
  const candidateIsNumber = /^\d+$/.test(candidate);
  const currentIsNumber = /^\d+$/.test(current);
  if (candidateIsNumber && currentIsNumber) {
    return Number(candidate) > Number(current) ? 1 : -1;
  }
  if (candidateIsNumber) return -1;
  if (currentIsNumber) return 1;
  return candidate.localeCompare(current);
}
