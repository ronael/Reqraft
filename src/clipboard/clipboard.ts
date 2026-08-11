import clipboard from "clipboardy";
import { ReqraftError } from "../core/errors.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

export async function readClipboard(): Promise<string> {
  try {
    const content = await clipboard.read();
    return content.trim();
  } catch (error) {
    throw new ReqraftError("clipboard.read_failed", EXIT_CODES.GENERAL_ERROR, { cause: error });
  }
}

export async function writeClipboard(text: string): Promise<void> {
  try {
    await clipboard.write(text);
    const persistedText = await clipboard.read();
    if (persistedText !== text) {
      throw new ReqraftError("clipboard.write_failed", EXIT_CODES.GENERAL_ERROR);
    }
  } catch (error) {
    if (error instanceof ReqraftError) throw error;
    throw new ReqraftError("clipboard.write_failed", EXIT_CODES.GENERAL_ERROR, { cause: error });
  }
}
