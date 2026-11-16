import { ReqraftError } from "@/core/errors.js";
import { createTranslator } from "@/i18n/translate.js";
import { describeUiError } from "@/shared/errors.js";
import { mainLocale } from "./i18n.js";

/**
 * How a failure leaves the main process.
 *
 * Electron hands the renderer `error.toString()`, so whatever an IPC handler
 * throws is what a window ends up showing. Kept apart from `ipc.ts`, which
 * wires the channels: this file only decides how their failures read.
 */

/** What IPC handlers are registered on: Electron's `ipcMain`, or a test's fake. */
interface HandlerRegistry<Event> {
  handle(channel: string, listener: (event: Event, payload: unknown) => unknown): void;
}

/**
 * `ipcMain`, with every handler's failure worded for the window.
 *
 * Done once, where channels are registered, rather than in each handler: a
 * corrupted configuration file reaches most of them through `loadConfig`, and
 * a channel added later cannot forget what it never has to remember.
 */
export function failuresAsSentences<Event>(
  ipcMain: HandlerRegistry<Event>,
): HandlerRegistry<Event> {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, async (event, payload) => {
        try {
          return await listener(event, payload);
        } catch (error) {
          throw rendererFailure(error);
        }
      });
    },
  };
}

/**
 * A failure, as the sentence the window shows.
 *
 * A configuration file that no longer parses would read "ReqraftError:
 * config.invalid", and a provider's refusal "ProviderError: Provider error 401:
 * {raw body}" — a body that can echo the key. Reqraft's own errors carry a
 * code, so they become the shared catalogue's sentence, in the language of the
 * capsule's errors. Any other error is already a sentence and goes through
 * unchanged.
 *
 * `provider` names the provider a channel was asked about, for the sentences
 * that mention one; without it, they use the provider the error names.
 */
export function rendererFailure(error: unknown, provider?: string): unknown {
  if (!(error instanceof ReqraftError)) return error;
  const { message } = describeUiError(
    error,
    provider ?? String(error.params?.provider ?? ""),
    createTranslator(mainLocale()),
  );
  return new Error(message, { cause: error });
}
