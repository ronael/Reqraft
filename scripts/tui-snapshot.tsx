/* @jsxImportSource @opentui/react */
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SceneCapture } from "./tui-snapshot/frame-html.js";

/**
 * Photographs the real TUI.
 *
 * The app is mounted in OpenTUI's test renderer and driven at the keyboard —
 * type, generate, open the diff, open a picker — against the `mock` provider,
 * so every screen below is the one a user gets, not a mock-up of it. Each frame
 * is then serialised cell by cell, with the renderer's own colours.
 *
 * Two artefacts per screen, under `docs/design/snapshots/` (git-ignored, like
 * the rest of `docs/design/`):
 *
 * - an HTML page (plus `index.html` with all of them) — to look at, and to hold
 *   next to a design mock-up;
 * - a `.txt` character frame — readable in a terminal, easy to diff by hand
 *   when a layout change is suspected.
 *
 * Must run under Bun: OpenTUI's test renderer has no native FFI build for Node.
 * `pnpm snapshot:tui`.
 */

const HOME_MARKER = "REQRAFT_SNAPSHOT_HOME";
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../docs/design/snapshots");
const PROMPT = "fais moi un truc pour le site qui montre les avis clients";
const COLUMNS = 100;
const ROWS = 32;
/** Typing too fast coalesces the keys into one React update. */
const TYPING_DELAY_MS = 12;

/**
 * A throwaway home holding a `mock` provider config, so the snapshots never
 * depend on the machine's own configuration — and never touch it.
 */
async function prepareHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "reqraft-snapshot-"));
  const configDir = path.join(home, "Library", "Application Support", "rp");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify(
      { defaultProvider: "mock", defaultModel: "mock-model", uiLocale: "fr", stream: false },
      null,
      2,
    ),
    "utf8",
  );
  return home;
}

// Bun resolves the home directory once, at startup, so the throwaway home has
// to be in place before the process that renders anything begins.
if (process.env[HOME_MARKER] === undefined) {
  const home = await prepareHome();
  const relaunch = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      [HOME_MARKER]: home,
    },
    stdio: "inherit",
  });
  process.exit(relaunch.status ?? 1);
}

const { testRender } = await import("@opentui/react/test-utils");
const { OpenTuiApp, TranslatorContext } = await import("../src/opentui/app.js");
const { createTranslator } = await import("../src/i18n/translate.js");
const { renderScenePage, renderSnapshotPage } = await import("./tui-snapshot/frame-html.js");

const setup = await testRender(
  <TranslatorContext.Provider value={createTranslator("fr")}>
    <OpenTuiApp />
  </TranslatorContext.Provider>,
  { width: COLUMNS, height: ROWS },
);
const captures: SceneCapture[] = [];

function slug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function capture(id: string, title: string, caption: string): Promise<void> {
  await setup.flush();
  captures.push({ id, title, caption, frame: setup.captureSpans() });
  await writeFile(
    path.join(OUTPUT_DIR, `${id}-${slug(title)}.txt`),
    `${setup.captureCharFrame()}\n`,
    "utf8",
  );
}

/**
 * Renders until the screen shows what we are waiting for. `waitForFrame` only
 * spins render passes; the app's own work — reading the config, calling the
 * provider — needs wall-clock time between them.
 */
async function appears(predicate: (frame: string) => boolean, attempts: number): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await setup.flush();
    if (predicate(setup.captureCharFrame())) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function until(predicate: (frame: string) => boolean, label: string): Promise<void> {
  if (await appears(predicate, 100)) return;
  throw new Error(`écran jamais atteint : ${label}\n${setup.captureCharFrame()}`);
}

/**
 * Presses a key until the screen reacts. A keystroke needs a little wall-clock
 * time to travel through the parser and React before the next frame shows it,
 * and the very first one after mount is sometimes swallowed entirely.
 */
async function press(
  key: () => void,
  ready: (frame: string) => boolean,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    key();
    await setup.flush();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setup.flush();
    if (ready(setup.captureCharFrame())) return;
  }
  throw new Error(`touche sans effet : ${label}\n${setup.captureCharFrame()}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });

await until((frame) => frame.includes("Prompt original"), "écran principal");
await capture("01", "saisie vide", "au démarrage, avant toute frappe");

await setup.mockInput.typeText(PROMPT, TYPING_DELAY_MS);
await capture("02", "prompt saisi", "l'éditeur rempli, le résultat encore vide");

// The mock provider answers almost instantly, so the loading screen is a race:
// it is captured when it shows up and skipped otherwise, rather than failing
// the run over a frame nobody can guarantee.
setup.mockInput.pressKey("g", { ctrl: true });
if (await appears((frame) => frame.includes("› Génération"), 20)) {
  await capture("03", "generation", "l'écran d'attente, ligne de scan pendant l'appel");
}

await appears((frame) => frame.includes("› Prompt amélioré") && frame.includes("[mock]"), 100);
await capture("04", "resultat", "le résultat du provider mock, verdict et jauge compris");

await press(
  () => {
    setup.mockInput.pressKey("d", { ctrl: true });
  },
  (frame) => frame.includes("› Diff"),
  "⌃D diff",
);
await capture("05", "diff", "la vue diff, ⌃D");

await press(
  () => {
    setup.mockInput.pressKey("d", { ctrl: true });
  },
  (frame) => frame.includes("› Prompt amélioré"),
  "⌃D retour",
);
await press(
  () => {
    setup.mockInput.pressKey("p", { ctrl: true });
  },
  (frame) => frame.includes("Changer de profil"),
  "⌃P profil",
);
await capture("06", "selecteur de profil", "le sélecteur ⌃P par-dessus le flux");

await press(
  () => {
    setup.mockInput.pressEscape();
  },
  (frame) => !frame.includes("Changer de profil"),
  "esc fermeture",
);
await press(
  () => {
    setup.mockInput.pressKey("r", { ctrl: true });
  },
  (frame) => frame.includes("0 lignes"),
  "⌃R réinitialiser",
);
await press(
  () => {
    setup.mockInput.pressKey("?");
  },
  (frame) => frame.includes("Aide Reqraft"),
  "? aide",
);
await capture("07", "aide", "l'aide « ? », quand l'éditeur est vide");

await press(
  () => {
    setup.mockInput.pressEscape();
  },
  (frame) => !frame.includes("Aide Reqraft"),
  "esc fermeture aide",
);
setup.resize(64, 24);
await capture("08", "terminal etroit", "le même écran en 64×24, mode compact");

for (const scene of captures) {
  await writeFile(
    path.join(OUTPUT_DIR, `${scene.id}-${slug(scene.title)}.html`),
    renderScenePage(scene),
    "utf8",
  );
}
await writeFile(
  path.join(OUTPUT_DIR, "index.html"),
  renderSnapshotPage(captures, new Date().toISOString().slice(0, 16).replace("T", " ")),
  "utf8",
);

process.stdout.write(
  `${String(captures.length)} écrans capturés → ${path.relative(process.cwd(), OUTPUT_DIR)}\n`,
);
process.exit(0);
