import { detectUnsupportedAdditions, isDisproportionateExpansion } from "@/core/fidelity.js";
import { hasRewriteInstructionWrapper } from "@/core/rewrite-instruction.js";
import type { FidelityBenchmarkCase } from "./fidelity-cases.js";

/** v2 rejects delegated rewrites and empty outputs; do not compare its scores to v1. */
export const FIDELITY_SCORE_VERSION = 2;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function scoreFidelityCase(benchmarkCase: FidelityBenchmarkCase, output: string) {
  const preservedTerms = benchmarkCase.mustPreserve?.length
    ? benchmarkCase.mustPreserve.filter((term) => output.toLowerCase().includes(term.toLowerCase()))
        .length / benchmarkCase.mustPreserve.length
    : 1;
  const forbiddenAdditions = [
    ...new Set([
      ...benchmarkCase.forbiddenAdditions.filter((term) =>
        output.toLowerCase().includes(term.toLowerCase()),
      ),
      ...detectUnsupportedAdditions(benchmarkCase.input, output),
    ]),
  ];
  const disproportionateExpansion = isDisproportionateExpansion(
    benchmarkCase.input,
    output,
    benchmarkCase.level,
  );
  const nonEmpty = output.trim().length > 0;
  const rewriteInstruction = hasRewriteInstructionWrapper(benchmarkCase.input, output);
  const acceptableOutput =
    benchmarkCase.acceptableOutputs === undefined ||
    benchmarkCase.acceptableOutputs.some((candidate) => normalize(candidate) === normalize(output));
  const noForbiddenScore = forbiddenAdditions.length === 0 ? 1 : 0;
  const proportionScore = disproportionateExpansion ? 0 : 1;
  const componentScore = (preservedTerms + noForbiddenScore + proportionScore + 1) / 4;
  const total = nonEmpty && !rewriteInstruction && acceptableOutput ? componentScore : 0;
  return {
    preservedTerms,
    forbiddenAdditions,
    disproportionateExpansion,
    nonEmpty,
    rewriteInstruction,
    acceptableOutput,
    total,
  };
}
