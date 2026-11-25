import process from "node:process";
import readline from "node:readline";

/** One key, as the interactive commands understand it. */
export type Key = "enter" | "escape" | "up" | "down" | "interrupt" | { char: string };

/**
 * Waits for a single key on a terminal, in raw mode, then gives the terminal
 * back as it was.
 */
export function readKey(input: NodeJS.ReadStream = process.stdin): Promise<Key> {
  readline.emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve) => {
    const onKey = (text: string | undefined, key: readline.Key | undefined): void => {
      input.off("keypress", onKey);
      input.setRawMode(wasRaw);
      input.pause();
      if (key?.ctrl === true && key.name === "c") resolve("interrupt");
      else if (key?.name === "return" || key?.name === "enter") resolve("enter");
      else if (key?.name === "escape") resolve("escape");
      else if (key?.name === "up") resolve("up");
      else if (key?.name === "down") resolve("down");
      else resolve({ char: (text ?? "").toLowerCase() });
    };
    input.on("keypress", onKey);
  });
}

export interface ChoiceIo {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  /** Marks the selected line; plain text when the terminal has no colour. */
  highlight(line: string): string;
}

/**
 * A short list chosen with the arrows (or 1–9) and Enter. Returns the index,
 * or null on Escape or Ctrl+C.
 */
export async function choose(
  question: string,
  options: readonly string[],
  io: ChoiceIo,
): Promise<number | null> {
  let selected = 0;
  const draw = (redraw: boolean): void => {
    if (redraw) io.output.write(`\u001B[${String(options.length)}A`);
    options.forEach((option, index) => {
      const line = index === selected ? io.highlight(`› ${option}`) : `  ${option}`;
      io.output.write(`\u001B[2K${line}\n`);
    });
  };

  io.output.write(`${question}\n`);
  draw(false);
  for (;;) {
    const key = await readKey(io.input);
    if (key === "enter") return selected;
    if (key === "escape" || key === "interrupt") return null;
    if (key === "up") selected = (selected - 1 + options.length) % options.length;
    else if (key === "down") selected = (selected + 1) % options.length;
    else if (typeof key === "object" && /^[1-9]$/.test(key.char)) {
      const index = Number(key.char) - 1;
      if (index < options.length) return index;
    } else {
      // Any other key leaves the choice where it was.
    }
    draw(true);
  }
}
