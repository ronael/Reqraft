/**
 * Model servers that run on the user's own hardware.
 *
 * Reqraft embeds no model: offline use means pointing the OpenAI-compatible
 * provider at a server the user runs. Ollama and LM Studio are the two most
 * people have, and each listens on a fixed port unless told otherwise, which
 * is where `rp init` and the desktop onboarding look first.
 */

export type LocalServerKind = "ollama" | "lmstudio";

export interface LocalServerDefinition {
  kind: LocalServerKind;
  label: string;
  baseUrl: string;
  port: number;
}

export const LOCAL_SERVERS: readonly LocalServerDefinition[] = [
  { kind: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", port: 11434 },
  { kind: "lmstudio", label: "LM Studio", baseUrl: "http://localhost:1234/v1", port: 1234 },
];

function parseUrl(value: string): URL | undefined {
  // `URL.parse` would read better, but it arrived in Node 22 and the CLI
  // still supports Node 20.
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Private, loopback and link-local IPv4 ranges — a machine of the user's own
 * network — as a first octet and the range its second one may take.
 */
const PRIVATE_IPV4_RANGES: readonly (readonly [number, number, number])[] = [
  [127, 0, 255],
  [10, 0, 255],
  [172, 16, 31],
  [192, 168, 168],
  [169, 254, 254],
];

function isPrivateIpv4(host: string): boolean {
  const octets = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!octets) return false;
  const first = Number(octets[1]);
  const second = Number(octets[2]);
  return PRIVATE_IPV4_RANGES.some(
    ([octet, low, high]) => first === octet && second >= low && second <= high,
  );
}

/** Loopback, unique-local (`fc00::/7`) and link-local (`fe80::/10`) IPv6. */
const PRIVATE_IPV6 = [/^::1$/, /^f[cd][0-9a-f]{0,2}:/, /^fe[89ab][0-9a-f]?:/];

/** Names that only ever resolve to this machine or its own network. */
const LOCAL_HOSTS = new Set(["localhost", "host.docker.internal", "0.0.0.0"]);
const LOCAL_SUFFIXES = [".localhost", ".local"];

/**
 * Whether a base URL points at hardware the user controls: this machine or
 * the local network.
 *
 * That is what decides how Reqraft talks to it (`ProviderAdapter.local`): a
 * server there runs a small model with a small default context, at the speed
 * of a laptop. A public host is a hosted gateway, whatever it serves.
 */
export function isLocalEndpoint(baseUrl: string): boolean {
  const url = parseUrl(baseUrl.trim());
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return (
    LOCAL_HOSTS.has(host) ||
    LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    isPrivateIpv4(host) ||
    PRIVATE_IPV6.some((pattern) => pattern.test(host))
  );
}

/**
 * The local server a base URL most likely names, from its port.
 *
 * A guess, used only for advice — which command installs a model — never to
 * decide how to talk to the server.
 */
export function localServerKind(baseUrl: string): LocalServerKind | undefined {
  const url = parseUrl(baseUrl.trim());
  if (!url || !isLocalEndpoint(baseUrl)) return undefined;
  const port = Number(url.port);
  return LOCAL_SERVERS.find((server) => server.port === port)?.kind;
}

/**
 * "http://host/v1/" and "http://host/v1" name the same API root.
 *
 * A loop rather than `/\/+$/`: the input is whatever someone typed, and an
 * anchored repetition backtracks on a long run of slashes.
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }
  return url.slice(0, end);
}
