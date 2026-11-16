/**
 * The model to install when a local server has none that fits.
 *
 * Qwen3.5, Apache 2.0, in the two sizes a laptop can hold: 4B for 8 GB of
 * memory, 9B from 16 GB. Chosen for French and English rewriting of short
 * prompts; the measurements behind the choice are in `benchmark/local-model-*`
 * and docs/local-models.md. Sizes are the ones Ollama's library lists for the
 * default tag, which varies with the platform's build.
 */
export interface LocalModelRecommendation {
  /** The Ollama tag. */
  id: string;
  /** Download size, in GB, as a range: the library ships a different build per platform. */
  sizeGb: { min: number; max: number };
  /** The machine's memory, rounded to whole GB, that the choice was made for. */
  memoryGb: number;
  /** The command that installs it on Ollama. */
  pullCommand: string;
  /** What to search for in LM Studio's catalogue, which has no such command. */
  searchTerm: string;
}

const SMALL = { id: "qwen3.5:4b", sizeGb: { min: 3.3, max: 4 }, searchTerm: "Qwen3.5 4B" };
const LARGE = { id: "qwen3.5:9b", sizeGb: { min: 6.6, max: 7.6 }, searchTerm: "Qwen3.5 9B" };

const GIB = 1024 ** 3;

/**
 * A machine sold with 16 GB reports a little less — firmware and integrated
 * graphics keep their share — so the bar sits below 16.
 */
const LARGE_MODEL_MEMORY_BYTES = 14 * GIB;

export function recommendLocalModel(totalMemoryBytes: number): LocalModelRecommendation {
  const choice = totalMemoryBytes >= LARGE_MODEL_MEMORY_BYTES ? LARGE : SMALL;
  return {
    ...choice,
    memoryGb: Math.round(totalMemoryBytes / GIB),
    pullCommand: `ollama pull ${choice.id}`,
  };
}

/** "3,3–4" in French, "3.3–4" in English: the size range with the reader's decimal mark. */
export function formatSizeRange(size: LocalModelRecommendation["sizeGb"], locale: string): string {
  const format = (value: number): string =>
    value.toLocaleString(locale, { maximumFractionDigits: 1 });
  return `${format(size.min)}–${format(size.max)}`;
}
