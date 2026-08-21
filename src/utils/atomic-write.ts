import { link, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface WriteAtomicFileOptions {
  mode?: number;
  dirMode?: number;
  encoding?: BufferEncoding;
  overwrite?: boolean;
}

/**
 * Writes a file atomically by creating a uniquely named temporary file in the
 * destination directory, writing the content with specified permissions (default 0600),
 * and atomically publishing it at the target path.
 */
export async function writeAtomicFile(
  targetPath: string,
  content: string | Uint8Array,
  options: WriteAtomicFileOptions = {},
): Promise<void> {
  const { mode = 0o600, dirMode = 0o700, encoding = "utf8", overwrite = true } = options;
  const targetDir = path.dirname(targetPath);
  await mkdir(targetDir, { recursive: true, mode: dirMode });

  const tempPath = path.join(
    targetDir,
    // Unpredictable suffix: the temp file already holds the final content before
    // publication, so its name must not be guessable by another process.
    `.tmp.${String(process.pid)}.${String(Date.now())}.${randomUUID()}`,
  );

  try {
    if (typeof content === "string") {
      await writeFile(tempPath, content, { encoding, mode });
    } else {
      await writeFile(tempPath, content, { mode });
    }

    if (overwrite) {
      await rename(tempPath, targetPath);
      return;
    }

    // `link` fails with EEXIST instead of replacing an existing target. This
    // closes the race between a preliminary existence check and publication.
    await link(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  // The target now exists and is complete: a failure to remove the extra link
  // must not be reported as a write failure.
  await unlink(tempPath).catch(() => undefined);
}
