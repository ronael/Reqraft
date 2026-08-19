/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { EditorScreen } from "@/apps/cli/tui/screens/EditorScreen.js";
import { INITIAL_FOCUS } from "@/apps/cli/tui/model/focus.js";
import { INITIAL_OVERLAY, type OverlayState } from "@/apps/cli/tui/model/overlay.js";
import { createTranslator } from "@/i18n/translate.js";

registerRendererTeardown();

/**
 * Layout integrity at the frame level.
 *
 * These assert on the rendered character grid rather than on props, because
 * every bug they cover was invisible in the component tree and obvious in the
 * frame: an overlay that sat in the flex column grew the root past the
 * terminal, and a terminal does not clip on overflow — it overwrites, so the
 * status bar painted into the transcript's cells and produced a run-together
 * footer that no amount of spacing would have fixed.
 */

const SETTINGS = { profile: "auto", level: "minimal", provider: "openai", model: "gpt-5-mini" };
const PROMPT =
  "visuellement je vois encore des defauts notamment sur les modales, qui ne correspondent pas a la maquette.";

async function frameOf(
  width: number,
  height: number,
  overlay: OverlayState = INITIAL_OVERLAY,
  locale: "fr" | "en" = "fr",
  settings = SETTINGS,
): Promise<string[]> {
  const setup = trackRenderer(
    await testRender(
      <EditorScreen
        width={width}
        height={height}
        prompt={PROMPT}
        submittedPrompt={PROMPT}
        result={{ kind: "success", text: "Un resultat court.", quality: undefined }}
        view="result"
        focus={INITIAL_FOCUS}
        overlay={overlay}
        settings={settings}
        ready
        toast={null}
        t={createTranslator(locale)}
        onPromptChange={() => undefined}
        onCommand={() => undefined}
        onOverlaySelect={() => undefined}
      />,
      { width, height },
    ),
  );
  await setup.flush();
  return setup.captureCharFrame().split("\n");
}

/** Rows that carry a box edge, i.e. the dialog and the editor surface. */
const boxRows = (rows: string[]): number[] =>
  rows.flatMap((row, index) => (/[┌┐└┘│├┤─]/.test(row) ? [index] : []));

const SIZES: readonly (readonly [number, number])[] = [
  [120, 40],
  [100, 35],
  [90, 30],
  [80, 24],
  [72, 24],
  [64, 20],
];

describe("frame integrity", () => {
  test.each(SIZES)(
    "no row exceeds the terminal at %ix%i",
    async (width, height) => {
      for (const overlay of [
        INITIAL_OVERLAY,
        { active: "help", index: 0, query: "" },
        { active: "level", index: 1, query: "" },
        { active: "palette", index: 0, query: "" },
      ] as OverlayState[]) {
        const rows = await frameOf(width, height, overlay);
        for (const row of rows) {
          expect(row.length).toBeLessThanOrEqual(width);
        }
        expect(rows.length).toBeLessThanOrEqual(height + 1);
      }
    },
    120_000,
  );

  test.each(SIZES)(
    "the footer stays intact behind an overlay at %ix%i",
    async (width, height) => {
      const withOverlay = await frameOf(width, height, { active: "help", index: 0, query: "" });
      // The status bar renders its own row. Interleaving with the transcript
      // produced "^GsGenerernt^ReReinitialiserde" — a chord immediately followed
      // by a letter is the signature of that collision. A block glyph is the
      // scrollbar, which has its own column and is covered by another test.
      const corrupted = withOverlay.filter((row) => /\^[A-Z][A-Za-z]/.test(row));
      expect(corrupted).toEqual([]);
    },
    120_000,
  );

  test.each(SIZES)(
    "an open dialog stays inside the viewport at %ix%i",
    async (width, height) => {
      const rows = await frameOf(width, height, { active: "help", index: 0, query: "" });
      const edges = boxRows(rows);
      expect(edges.length).toBeGreaterThan(0);
      // A dialog that ran off the bottom left its last border row missing, so the
      // final framed row sat on the very last line of the terminal.
      expect(Math.max(...edges)).toBeLessThan(rows.length);
    },
    120_000,
  );

  test("the editor surface keeps a complete border", async () => {
    const rows = await frameOf(100, 35);
    const opens = rows.filter((row) => row.includes("┌")).length;
    const closes = rows.filter((row) => row.includes("└")).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  }, 60_000);

  test("the header holds one row with long provider and model names", async () => {
    const rows = await frameOf(80, 24, INITIAL_OVERLAY, "fr", {
      profile: "web-design",
      level: "complete",
      provider: "openai-compatible",
      model: "claude-sonnet-4-20250514",
    });
    // The header is row 0; row 1 must not be a wrapped continuation of it.
    expect(rows[1]?.trim()).toBe("");
  }, 60_000);

  test("the footer fits both locales down to 64 columns", async () => {
    for (const locale of ["fr", "en"] as const) {
      for (const width of [80, 72, 64]) {
        const rows = await frameOf(width, 24, INITIAL_OVERLAY, locale);
        const footer = rows.filter((row) => row.includes("^G"));
        expect(footer.length).toBeGreaterThan(0);
        for (const row of footer) {
          expect(row.length).toBeLessThanOrEqual(width);
        }
      }
    }
  }, 120_000);
});
