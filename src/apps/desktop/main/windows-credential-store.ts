import path from "node:path";
import process from "node:process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  getProviderEnvName,
  listCredentialProviders,
  type CredentialProvider,
} from "@/providers/catalog.js";

const STORE_VERSION = 1;
const StoreSchema = z
  .object({
    version: z.literal(STORE_VERSION),
    credentials: z.record(z.string(), z.string().min(1)),
  })
  .strict();

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface WindowsCredentialStore {
  readonly available: boolean;
  readonly hydrate: (env: NodeJS.ProcessEnv) => Promise<void>;
  readonly set: (provider: CredentialProvider, secret: string) => Promise<void>;
  readonly delete: (provider: CredentialProvider) => Promise<void>;
}

/**
 * Desktop-only credential storage backed by Electron safeStorage.
 *
 * On Windows Electron delegates encryption to DPAPI. The persisted JSON only
 * contains encrypted base64 blobs tied to the current Windows account; the
 * clear text exists solely while validating or hydrating the process env.
 */
export function createWindowsCredentialStore(options: {
  filePath: string;
  safeStorage: SafeStorageLike;
}): WindowsCredentialStore {
  const available = options.safeStorage.isEncryptionAvailable();

  const read = async (): Promise<z.infer<typeof StoreSchema>> => {
    try {
      return StoreSchema.parse(JSON.parse(await readFile(options.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: STORE_VERSION, credentials: {} };
      }
      throw error;
    }
  };

  const write = async (store: z.infer<typeof StoreSchema>): Promise<void> => {
    await mkdir(path.dirname(options.filePath), { recursive: true });
    const temporaryPath = `${options.filePath}.${String(process.pid)}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, options.filePath);
  };

  return {
    available,
    async hydrate(env) {
      if (!available) return;
      let store: z.infer<typeof StoreSchema>;
      try {
        store = await read();
      } catch {
        return;
      }
      for (const { id: provider } of listCredentialProviders()) {
        const envName = getProviderEnvName(provider);
        const encrypted = store.credentials[provider];
        if (env[envName] || !encrypted) continue;
        try {
          env[envName] = options.safeStorage.decryptString(Buffer.from(encrypted, "base64"));
        } catch {
          // One damaged or foreign DPAPI blob must not stop the application.
        }
      }
    },
    async set(provider, secret) {
      if (!available) throw new Error("Windows secure storage is unavailable.");
      const store = await read();
      store.credentials[provider] = options.safeStorage.encryptString(secret).toString("base64");
      await write(store);
    },
    async delete(provider) {
      if (!available) throw new Error("Windows secure storage is unavailable.");
      const store = await read();
      Reflect.deleteProperty(store.credentials, provider);
      if (Object.keys(store.credentials).length === 0) {
        await unlink(options.filePath).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
        return;
      }
      await write(store);
    },
  };
}
