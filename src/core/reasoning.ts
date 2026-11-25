/**
 * Reasoning a model wrote into its visible answer.
 *
 * Thinking models (Qwen3.x, DeepSeek-R1 and the models distilled from them)
 * write their reasoning between `<think>` and `</think>` before answering.
 * Servers that separate it — Ollama's `reasoning`, LM Studio's and llama.cpp's
 * `reasoning_content` — keep it out of the content; a server that does not,
 * or a chat template that opens the block itself so that only `</think>`
 * comes back, leaves it in the text Reqraft parses. Kept, the reasoning was
 * shown as the rewrite, and a brace inside it could be taken for the start of
 * the JSON envelope.
 *
 * Only reasoning that opens the answer is removed. A request about these tags
 * — "remove the <think> blocks from the parser output" — must come back
 * intact, and a model always thinks before it answers, never in the middle.
 */

const OPEN = "<think>";
const CLOSE = "</think>";

/** The answer starts here: what precedes a JSON envelope is never reasoning. */
function opensEnvelope(text: string): boolean {
  return text.startsWith("{") || text.startsWith("`");
}

/**
 * The answer without the reasoning that precedes it.
 *
 * - `<think>…</think>` at the start is dropped, as many times as it repeats;
 * - a `<think>` never closed means the output limit cut the reasoning short:
 *   there is no answer, and the empty string says so;
 * - a `</think>` with no opening tag before it, in an answer that does not
 *   start with the envelope, closes reasoning the template opened.
 */
export function stripReasoning(text: string): string {
  let rest = text.trimStart();

  while (rest.startsWith(OPEN)) {
    const close = rest.indexOf(CLOSE, OPEN.length);
    if (close === -1) return "";
    rest = rest.slice(close + CLOSE.length).trimStart();
  }

  if (!opensEnvelope(rest)) {
    const close = rest.indexOf(CLOSE);
    if (close !== -1 && !rest.slice(0, close).includes(OPEN)) {
      rest = rest.slice(close + CLOSE.length).trimStart();
    }
  }

  return rest;
}

export interface ReasoningFilter {
  /** The visible part of `fragment`, possibly empty while a tag is undecided. */
  push(fragment: string): string;
  /** Whatever was held back waiting for a tag to complete. */
  flush(): string;
}

/**
 * `stripReasoning` for a stream, fragment by fragment.
 *
 * Tags arrive split across fragments ("<thi" then "nk>"), so the start of the
 * answer is held until it can be told apart from an opening tag, and the end
 * of the reasoning is searched with the previous fragment's tail.
 *
 * The case of a template-opened block is left to `stripReasoning`, applied
 * again to the full text: telling that reasoning apart from a prose answer
 * means waiting for a `</think>` that may never come, and holding a whole
 * answer back would freeze the live preview on every model that ignores the
 * JSON instruction.
 */
export function createReasoningFilter(): ReasoningFilter {
  let state: "start" | "thinking" | "answer" = "start";
  let held = "";

  const pushStart = (): string => {
    const candidate = held.trimStart();
    if (candidate === "" || (candidate.length < OPEN.length && OPEN.startsWith(candidate))) {
      return "";
    }
    if (candidate.startsWith(OPEN)) {
      state = "thinking";
      held = candidate.slice(OPEN.length);
      return pushThinking();
    }
    state = "answer";
    held = "";
    return candidate;
  };

  const pushThinking = (): string => {
    const close = held.indexOf(CLOSE);
    if (close === -1) {
      // Keeps just enough to recognise a closing tag split across fragments.
      held = held.slice(Math.max(0, held.length - (CLOSE.length - 1)));
      return "";
    }
    held = held.slice(close + CLOSE.length);
    // Several blocks can follow one another before the answer.
    state = "start";
    return pushStart();
  };

  return {
    push(fragment) {
      if (state === "answer") return fragment;
      held += fragment;
      return state === "start" ? pushStart() : pushThinking();
    },
    flush() {
      // A tag prefix that never completed was answer text after all; an
      // unclosed reasoning block was never an answer.
      const rest = state === "start" ? held.trimStart() : "";
      held = "";
      return rest;
    },
  };
}
