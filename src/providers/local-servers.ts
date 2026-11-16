import { REPROMPT_POLICY } from "@/core/reprompt-policy.js";
import { LOCAL_SERVERS, type LocalServerDefinition } from "./local-endpoint.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

/** A local server as a probe found it. */
export interface DetectedLocalServer extends LocalServerDefinition {
  /** It answered its model list. */
  reachable: boolean;
  /** The chat models it serves, embedding models left out. */
  models: string[];
}

export interface ListInstalledModelsOptions {
  baseUrl: string;
  /** Used in error messages, like any provider name. */
  label: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Embedding models answer `/models` like any other — Ollama lists
 * `nomic-embed-text`, LM Studio `text-embedding-nomic-embed-text-v1.5` — but
 * cannot rewrite anything, and offering one is offering a broken setup.
 */
export function chatModels(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => !/embed/i.test(id)))];
}

/**
 * The chat models an OpenAI-compatible server has installed.
 *
 * Throws what the adapter throws: an unreachable server, a refused key, a
 * timeout. The callers decide what each means for them.
 */
export async function listInstalledModels(options: ListInstalledModelsOptions): Promise<string[]> {
  const adapter = new OpenAICompatibleProvider(options.label, {
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    customHeaders: options.customHeaders,
  });
  const models = await adapter.listModels(
    AbortSignal.timeout(options.timeoutMs ?? REPROMPT_POLICY.runtime.connectionCheckTimeoutMs),
  );
  return chatModels(models.map((model) => model.id));
}

/**
 * Looks for Ollama and LM Studio on their default ports, both at once.
 *
 * Bounded by a short timeout: a server that is not running refuses the
 * connection at once, and one that is answers its model list in a few
 * milliseconds — only a port held by something else could hang, and the setup
 * must not wait on it.
 */
export async function detectLocalServers(
  timeoutMs: number = REPROMPT_POLICY.runtime.localServerProbeTimeoutMs,
): Promise<DetectedLocalServer[]> {
  return await Promise.all(
    LOCAL_SERVERS.map(async (server): Promise<DetectedLocalServer> => {
      try {
        const models = await listInstalledModels({
          baseUrl: server.baseUrl,
          label: server.label,
          timeoutMs,
        });
        return { ...server, reachable: true, models };
      } catch {
        return { ...server, reachable: false, models: [] };
      }
    }),
  );
}
