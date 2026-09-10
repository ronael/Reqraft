import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = async (path: string): Promise<Buffer> =>
  readFile(new URL(`../../${path}`, import.meta.url));

describe("published brand assets", () => {
  it("ships the same editable vector on the landing and in the desktop", async () => {
    const [master, published] = await Promise.all([
      read("src/apps/desktop/renderer/assets/brand/reqraft-mark.svg"),
      read("docs/assets/reqraft-mark.svg"),
    ]);
    expect(published.equals(master)).toBe(true);
  });

  it("keeps the application icon at the required 1024px packaging size", async () => {
    const icon = await read("build/icon.png");
    expect(icon.subarray(1, 4).toString()).toBe("PNG");
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
  });
});
