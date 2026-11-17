import { describe, expect, it } from "vitest";
import { createReasoningFilter, stripReasoning } from "@/core/reasoning.js";

const ENVELOPE = '{"rewritten":"Corrige le bug de connexion.","warnings":[]}';

/** What a stream shows once every fragment went through the filter. */
function streamed(fragments: readonly string[]): string {
  const filter = createReasoningFilter();
  return fragments.map((fragment) => filter.push(fragment)).join("") + filter.flush();
}

describe("stripReasoning", () => {
  it("drops the reasoning a thinking model writes before its answer", () => {
    expect(stripReasoning(`<think>\nThe user wants { a fix }.\n</think>\n\n${ENVELOPE}`)).toBe(
      ENVELOPE,
    );
  });

  it("drops consecutive reasoning blocks", () => {
    expect(stripReasoning(`<think>a</think>\n<think>b</think>${ENVELOPE}`)).toBe(ENVELOPE);
  });

  it("leaves nothing when the output limit cut the reasoning short", () => {
    expect(stripReasoning("<think>\nLet me think about { the JSON")).toBe("");
  });

  it("drops reasoning whose opening tag the chat template wrote", () => {
    expect(stripReasoning(`Okay, the user wants a fix.\n</think>\n\n${ENVELOPE}`)).toBe(ENVELOPE);
  });

  it("keeps tags the request itself talks about", () => {
    const answer =
      '{"rewritten":"Retire les blocs <think> et </think> de la sortie.","warnings":[]}';
    expect(stripReasoning(answer)).toBe(answer);
    expect(stripReasoning("Remove the <think> and </think> tags from the parser output.")).toBe(
      "Remove the <think> and </think> tags from the parser output.",
    );
  });

  it("returns an answer without reasoning unchanged", () => {
    expect(stripReasoning(ENVELOPE)).toBe(ENVELOPE);
  });
});

describe("createReasoningFilter", () => {
  it("hides reasoning whose tags are split across fragments", () => {
    expect(streamed(["<thi", "nk>The user", " wants a fix.</th", "ink>\n\n", ENVELOPE])).toBe(
      ENVELOPE,
    );
  });

  it("forwards an answer without reasoning as it arrives", () => {
    const filter = createReasoningFilter();
    expect(filter.push('{"rewritten":"Cor')).toBe('{"rewritten":"Cor');
    expect(filter.push('rige."}')).toBe('rige."}');
    expect(filter.flush()).toBe("");
  });

  it("holds a fragment that could still open a reasoning block", () => {
    const filter = createReasoningFilter();
    expect(filter.push("\n<th")).toBe("");
    expect(filter.push("is is prose")).toBe("<this is prose");
  });

  it("releases a tag prefix the stream never completed", () => {
    expect(streamed(["<th"])).toBe("<th");
  });

  it("shows nothing of reasoning the output limit cut short", () => {
    expect(streamed(["<think>", "Let me think about { the JSON"])).toBe("");
  });

  it("drops consecutive reasoning blocks", () => {
    expect(streamed(["<think>a</think>", " <think>b</think>", ENVELOPE])).toBe(ENVELOPE);
  });

  it("finds the closing tag even when one fragment carries several tags", () => {
    expect(streamed([`<think>x</think>${ENVELOPE}`])).toBe(ENVELOPE);
  });
});
