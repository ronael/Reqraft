import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getConfigDir } from "@/config/paths.js";
import { writeAtomicFile } from "@/utils/atomic-write.js";
import { checkNpmUpdate, isVersionNewer, type UpdateFetcher } from "@/updates/check.js";
import type { Translator } from "@/i18n/translate.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const REMINDER_INTERVAL_MS = 7 * CHECK_INTERVAL_MS;

const CacheSchema = z.object({
  checkedAt: z.number(),
  latestVersion: z.string(),
  notifiedVersion: z.string().optional(),
  notifiedAt: z.number().optional(),
});
type UpdateCache = z.infer<typeof CacheSchema>;

interface NotifierGate {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  stderrIsTTY: boolean | undefined;
  exitCode: string | number | null | undefined;
}

export function shouldRunCliUpdateNotifier(gate: NotifierGate): boolean {
  if (gate.stderrIsTTY !== true || (gate.exitCode != null && Number(gate.exitCode) !== 0)) {
    return false;
  }
  if (gate.argv.includes("--json") || gate.env.CI !== undefined) return false;
  if (gate.env.NO_UPDATE_NOTIFIER !== undefined || gate.env.NODE_ENV === "test") return false;
  return gate.env.npm_lifecycle_event?.startsWith("test") !== true;
}

interface NotifyOptions {
  currentVersion: string;
  t: Translator;
  output?: { error(message: string): void };
  now?: () => number;
  fetcher?: UpdateFetcher;
  cachePath?: string;
}

export async function notifyCliUpdate(options: NotifyOptions): Promise<void> {
  const now = options.now?.() ?? Date.now();
  const cachePath = options.cachePath ?? path.join(getConfigDir(), "update-check.json");
  let cache = await readCache(cachePath);

  if (cache === undefined || now - cache.checkedAt >= CHECK_INTERVAL_MS) {
    const update = await checkNpmUpdate(options.currentVersion, {
      fetcher: options.fetcher,
      signal: AbortSignal.timeout(900),
    });
    cache = {
      checkedAt: now,
      latestVersion: update.latestVersion,
      ...(cache?.notifiedVersion === undefined
        ? {}
        : { notifiedVersion: cache.notifiedVersion, notifiedAt: cache.notifiedAt }),
    };
    await writeCache(cachePath, cache);
  }

  if (!isVersionNewer(cache.latestVersion, options.currentVersion)) return;
  const alreadyNotified =
    cache.notifiedVersion === cache.latestVersion &&
    cache.notifiedAt !== undefined &&
    now - cache.notifiedAt < REMINDER_INTERVAL_MS;
  if (alreadyNotified) return;

  (options.output ?? console).error(
    options.t("cli.update.available", {
      current: options.currentVersion,
      latest: cache.latestVersion,
    }),
  );
  await writeCache(cachePath, {
    ...cache,
    notifiedVersion: cache.latestVersion,
    notifiedAt: now,
  });
}

async function readCache(cachePath: string): Promise<UpdateCache | undefined> {
  try {
    return CacheSchema.parse(JSON.parse(await readFile(cachePath, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

async function writeCache(cachePath: string, cache: UpdateCache): Promise<void> {
  await writeAtomicFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, {
    mode: 0o600,
    dirMode: 0o700,
  });
}
