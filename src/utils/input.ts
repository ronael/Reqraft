import { readFile } from "node:fs/promises";
import process from "node:process";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "./exit-codes.js";

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8").trim());
    });
    process.stdin.on("error", reject);
  });
}

export async function readFileContent(path: string): Promise<string> {
  try {
    const content = await readFile(path, "utf8");
    return content.trim();
  } catch (error) {
    throw new ReqraftError("input.file_unreadable", EXIT_CODES.INVALID_INPUT, {
      params: { path },
      cause: error,
    });
  }
}
