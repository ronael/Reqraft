import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import type { PathLike } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAtomicFile } from "@/utils/atomic-write.js";

// Only lever available to simulate a temporary file that cannot be removed once
// the target has been published; every other call keeps the real behaviour.
const fsFailures = vi.hoisted(() => ({ temporaryUnlink: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<{ unlink: (target: PathLike) => Promise<void> }>();
  return {
    ...actual,
    unlink: (target: PathLike) => {
      if (fsFailures.temporaryUnlink && String(target).includes(".tmp.")) {
        return Promise.reject(Object.assign(new Error("EPERM"), { code: "EPERM" }));
      }
      return actual.unlink(target);
    },
  };
});

describe("writeAtomicFile utility", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rp-test-atomic-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("writes string content and creates parent directory", async () => {
    const targetPath = path.join(tempDir, "deep", "nested", "file.txt");
    await writeAtomicFile(targetPath, "hello world\n");

    const content = await readFile(targetPath, "utf8");
    expect(content).toBe("hello world\n");

    // Verify no temporary files remain in the target directory
    const files = await readdir(path.dirname(targetPath));
    expect(files).toEqual(["file.txt"]);
  });

  it("writes Uint8Array binary content", async () => {
    const targetPath = path.join(tempDir, "binary.dat");
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await writeAtomicFile(targetPath, bytes);

    const readBytes = await readFile(targetPath);
    expect(new Uint8Array(readBytes)).toEqual(bytes);
  });

  it("does not replace an existing file when overwrite is false", async () => {
    const targetPath = path.join(tempDir, "existing.txt");
    await writeAtomicFile(targetPath, "first");

    await expect(writeAtomicFile(targetPath, "second", { overwrite: false })).rejects.toMatchObject(
      {
        code: "EEXIST",
      },
    );
    await expect(readFile(targetPath, "utf8")).resolves.toBe("first");
  });

  it("leaves no temporary file behind when publication fails", async () => {
    const targetPath = path.join(tempDir, "existing.txt");
    await writeAtomicFile(targetPath, "first");

    await expect(writeAtomicFile(targetPath, "second", { overwrite: false })).rejects.toMatchObject(
      { code: "EEXIST" },
    );

    const files = await readdir(tempDir);
    expect(files).toEqual(["existing.txt"]);
  });

  it("lets a single concurrent writer win when overwrite is false", async () => {
    const targetPath = path.join(tempDir, "race.txt");

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        writeAtomicFile(targetPath, `writer-${String(index)}`, { overwrite: false }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect((result.reason as NodeJS.ErrnoException).code).toBe("EEXIST");
      }
    }

    const content = await readFile(targetPath, "utf8");
    expect(content).toMatch(/^writer-\d+$/);
    expect(await readdir(tempDir)).toEqual(["race.txt"]);
  });

  it("reports a success when the target is published but the temporary file survives", async () => {
    const targetPath = path.join(tempDir, "published.txt");
    fsFailures.temporaryUnlink = true;
    try {
      await expect(
        writeAtomicFile(targetPath, "published", { overwrite: false }),
      ).resolves.toBeUndefined();
    } finally {
      fsFailures.temporaryUnlink = false;
    }

    expect(await readFile(targetPath, "utf8")).toBe("published");
  });

  it.skipIf(process.platform === "win32")(
    "sets file permissions to 0600 and directory permissions to 0700 by default",
    async () => {
      const nestedDir = path.join(tempDir, "perms");
      const targetPath = path.join(nestedDir, "secure.txt");
      await writeAtomicFile(targetPath, "secret");

      const fileStats = await stat(targetPath);
      expect(fileStats.mode & 0o777).toBe(0o600);

      const dirStats = await stat(nestedDir);
      expect(dirStats.mode & 0o777).toBe(0o700);
    },
  );
});
