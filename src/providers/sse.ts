/**
 * Incremental reading of a server-sent event body.
 *
 * Adapters used to buffer the whole response before parsing it, which made
 * `stream: true` invisible to the user. Reading line by line is what lets the
 * TUI show text as it arrives.
 */

/**
 * Splits a byte stream into lines across chunk boundaries.
 *
 * A network chunk can end mid-line, so the tail is held until the next chunk
 * completes it. Call with `null` to flush whatever is left.
 */
export function createLineSplitter(): (chunk: string | null) => string[] {
  let pending = "";

  return (chunk) => {
    if (chunk === null) {
      const rest = pending;
      pending = "";
      return rest === "" ? [] : [rest];
    }

    const lines = (pending + chunk).split(/\r?\n/);
    pending = lines.pop() ?? "";
    return lines;
  };
}

/** Payload of a `data:` line, or undefined for anything else. */
export function parseDataLine(line: string): string | undefined {
  if (!line.startsWith("data:")) {
    return undefined;
  }
  return line.slice(5).trim();
}

export async function* streamLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const split = createLineSplitter();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield* split(decoder.decode(value, { stream: true }));
    }
    yield* split(null);
  } finally {
    reader.releaseLock();
  }
}
