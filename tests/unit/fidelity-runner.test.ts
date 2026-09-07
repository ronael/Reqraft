import { expect, it, vi } from "vitest";
import { runFidelityBenchmark, formatFidelityMarkdown } from "../../benchmark/fidelity-runner.js";
import { FIDELITY_BENCHMARK_CASES } from "../../benchmark/fidelity-cases.js";
import { MockProvider } from "@/providers/mock.js";

const cases = FIDELITY_BENCHMARK_CASES.filter(
  (entry) => entry.id === "clean-ambiguous-conversation-fragment",
);

it("runs both real engine paths, records samples and distinguishes failures from regressions", async () => {
  const provider = new MockProvider();
  const generate = vi
    .spyOn(provider, "generate")
    .mockResolvedValueOnce({ text: JSON.stringify({ rewritten: "ema conv :" }) })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        rewritten: 'Reformule le texte suivant : "ema conv :"',
        profile: "clean",
      }),
    })
    .mockRejectedValueOnce(new Error("fixture failure"))
    .mockResolvedValueOnce({ text: JSON.stringify({ rewritten: "Ema conv :", profile: "clean" }) });
  const run = await runFidelityBenchmark({
    provider,
    model: "mock-model",
    cases,
    profileMode: "both",
    repeat: 2,
  });
  expect(generate).toHaveBeenCalledTimes(4);
  expect(run.aggregate).toMatchObject({ cases: 4, failures: 1, regressions: 1 });
  expect(run.scoreVersion).toBe(2);
  expect(run.corpusHash).toMatch(/^[a-f0-9]{64}$/);
  expect(run.results.map((entry) => [entry.requestedProfile, entry.sample])).toEqual([
    ["clean", 1],
    ["auto", 1],
    ["clean", 2],
    ["auto", 2],
  ]);
  expect(run.results[0]?.requestHash).not.toBe(run.results[1]?.requestHash);
  expect(run.results[0]?.requestHash).toBe(run.results[2]?.requestHash);
  const markdown = formatFidelityMarkdown(run);
  expect(markdown).toContain("Human review");
  expect(markdown).toContain("ema conv :");
  expect(markdown).toContain("mock provider");
});
