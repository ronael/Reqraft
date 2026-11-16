import type {
  LocalServerEntry,
  LocalServersDetectResponse,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * The onboarding's view of the model servers on this machine.
 *
 * Pure rules over what `local-servers:detect` answered, kept apart from the
 * component so each can be tested without rendering a window: which server
 * the base URL names, what the form should propose once the answer arrives,
 * and which advice to show when there is no model to pick.
 */

/**
 * Where the search for Ollama and LM Studio stands. A search run again keeps
 * the previous answer on screen until the new one arrives, so the server menu
 * does not vanish under the cursor for the second it takes.
 */
export type LocalDetection =
  | { status: "idle" }
  | { status: "searching"; previous?: LocalServersDetectResponse }
  | { status: "done"; response: LocalServersDetectResponse }
  | { status: "failed" };

/** The last answer the search gave, even while it runs again. */
export function knownResponse(detection: LocalDetection): LocalServersDetectResponse | undefined {
  if (detection.status === "done") return detection.response;
  return detection.status === "searching" ? detection.previous : undefined;
}

/** The state a new search starts in, keeping what the last one found. */
export function searchAgain(detection: LocalDetection): LocalDetection {
  const previous = knownResponse(detection);
  return previous === undefined ? { status: "searching" } : { status: "searching", previous };
}

/**
 * An address without its surrounding spaces and trailing slashes. A loop, as
 * in `providers/local-endpoint.ts`, which the renderer cannot import: the
 * input is typed, and an anchored `/\/+$/` backtracks on a run of slashes.
 */
function normalisedAddress(address: string): string {
  const trimmed = address.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === "/") end -= 1;
  return trimmed.slice(0, end);
}

/** "http://localhost:11434/v1/" and "http://localhost:11434/v1" name one server. */
function sameAddress(a: string, b: string): boolean {
  return normalisedAddress(a) === normalisedAddress(b);
}

/** The servers that answered, in the order they were probed. */
export function runningServers(detection: LocalDetection): LocalServerEntry[] {
  return (knownResponse(detection)?.servers ?? []).filter((server) => server.reachable);
}

/** The running server a base URL names, if any. */
export function serverAt(detection: LocalDetection, baseUrl: string): LocalServerEntry | undefined {
  return runningServers(detection).find((server) => sameAddress(server.baseUrl, baseUrl));
}

/**
 * The model to propose for a server.
 *
 * A server with models offers only those: the current one when it has it,
 * else the recommended one when installed, else its first. Anywhere else —
 * a server with no model, none running, an address typed by hand — the
 * recommended model fills an empty field, since that is the one the advice
 * says to install; a model already typed stays.
 */
export function proposedModel(
  server: LocalServerEntry | undefined,
  recommended: string,
  current: string,
): string {
  if (server && server.models.length > 0) {
    if (server.models.some((model) => model.id === current)) return current;
    return (server.models.find((model) => model.id === recommended) ?? server.models[0])?.id ?? "";
  }
  return current.trim() === "" ? recommended : current;
}

export interface LocalFormFields {
  compatibleBaseUrl: string;
  model: string;
}

/**
 * What to change in the form once the search answers.
 *
 * The base URL moves only when it is still the untouched default and names a
 * server that is not running while another one is: someone who runs only LM
 * Studio should not have to know its port. An address someone typed is
 * theirs.
 */
export function proposeLocalSetup(
  form: LocalFormFields,
  detection: LocalDetection,
  defaultBaseUrl: string,
): Partial<LocalFormFields> {
  if (detection.status !== "done") return {};
  let baseUrl = form.compatibleBaseUrl;
  if (sameAddress(baseUrl, defaultBaseUrl) && serverAt(detection, baseUrl) === undefined) {
    const running = runningServers(detection);
    const preferred = running.find((server) => server.models.length > 0) ?? running[0];
    if (preferred) baseUrl = preferred.baseUrl;
  }
  const model = proposedModel(
    serverAt(detection, baseUrl),
    detection.response.recommendation.model,
    form.model,
  );
  return {
    ...(baseUrl === form.compatibleBaseUrl ? {} : { compatibleBaseUrl: baseUrl }),
    ...(model === form.model ? {} : { model }),
  };
}

/**
 * What to tell someone who has no model to pick.
 *
 * - `pull`: Ollama runs without a chat model, and installs one with a command;
 * - `search`: LM Studio runs without one, and has no such command;
 * - `install`: the address is Ollama's and nothing answers there, so the
 *   first step is Ollama itself.
 *
 * Nothing when the server has models, or for an address typed by hand: that
 * person knows where their model is.
 */
export type LocalAdvice =
  { kind: "pull"; server: string } | { kind: "search"; server: string } | { kind: "install" };

export function localAdvice(detection: LocalDetection, baseUrl: string): LocalAdvice | undefined {
  const probed = knownResponse(detection)?.servers.find((server) =>
    sameAddress(server.baseUrl, baseUrl),
  );
  if (!probed) return undefined;
  if (!probed.reachable) return probed.kind === "ollama" ? { kind: "install" } : undefined;
  if (probed.models.length > 0) return undefined;
  return probed.kind === "lmstudio"
    ? { kind: "search", server: probed.label }
    : { kind: "pull", server: probed.label };
}

export interface ModelChoice {
  id: string;
  name: string;
  recommended: boolean;
}

/**
 * The models the onboarding's menu offers: the provider's presets, or — for a
 * detected local server — the ones it has installed, the recommended one
 * marked. Empty means the model is typed.
 */
export function modelChoices(
  presets: readonly ModelChoice[],
  server: LocalServerEntry | undefined,
  recommended: string,
): ModelChoice[] {
  if (presets.length > 0) return [...presets];
  return (server?.models ?? []).map((model) => ({
    id: model.id,
    name: model.name,
    recommended: model.id === recommended,
  }));
}

/**
 * The name a compatible endpoint is saved under: a detected server's own, so
 * that an error says "Ollama is unreachable" rather than "OpenAI Compatible",
 * else whatever was typed, else none.
 */
export function endpointName(
  server: LocalServerEntry | undefined,
  typed: string,
): string | undefined {
  if (server) return server.label;
  const name = typed.trim();
  return name === "" ? undefined : name;
}
