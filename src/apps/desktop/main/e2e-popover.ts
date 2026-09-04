/**
 * Ce que le popover mesure de lui-même, dans le vrai renderer.
 *
 * Même principe que `e2e-capsule.ts` : la fenêtre réelle, le vrai preload, le
 * vrai IPC, le moteur derrière le fournisseur `mock`, et des rectangles rendus
 * par le moteur de rendu. Une règle CSS relue ne dit pas qu'un pied tient dans
 * une fenêtre de 320 × 260 ; ces nombres le disent.
 *
 * Il ne s'exécute que sous `REQRAFT_DESKTOP_E2E_PROBE` : hors scénario, rien de
 * ce fichier ne tourne.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CapsuleUiWindow } from "./e2e-capsule.js";
import type { PopoverMeasure, PopoverUiReport } from "@/apps/desktop/shared/e2e-report.js";

interface PopoverUiTargets {
  window: () => CapsuleUiWindow;
  open(): void;
  shotsDir?: string;
}

const PROMPT_FIELD = "textarea.popover-input";
const RESULT_FIELD = "textarea.result-editor-input";
const COPY = ".popover-footer .key-primary";
const TOAST = ".toast";

/** Un prompt assez long pour que le résultat déborde de la zone centrale. */
const LONG_PROMPT = Array.from(
  { length: 24 },
  (_, index) => `point ${String(index + 1)} a reformuler proprement`,
).join("\n");

const MULTILINE_EDIT = Array.from(
  { length: 14 },
  (_, index) => `ligne reprise ${String(index + 1)}`,
).join("\n");

async function evaluate<T>(target: CapsuleUiWindow, code: string): Promise<T> {
  return (await target.webContents.executeJavaScript(code, true)) as T;
}

/** Attend qu'une expression du renderer devienne vraie, sans délai fixe. */
async function waitFor(
  target: CapsuleUiWindow,
  expression: string,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await evaluate<boolean>(target, `Boolean(${expression})`)) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

async function waitForSelector(target: CapsuleUiWindow, selector: string): Promise<void> {
  await waitFor(target, `document.querySelector(${JSON.stringify(selector)}) !== null`, selector);
}

/**
 * Écrit dans un champ React contrôlé.
 *
 * Assigner `value` ne suffit pas : React garde sa propre valeur et réécrase la
 * nôtre au rendu suivant. Le setter natif du prototype, suivi d'un événement
 * `input`, est le chemin que React écoute réellement.
 */
function fillScript(selector: string, text: string): string {
  return `(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (field === null) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    field.focus();
    setter.call(field, ${JSON.stringify(text)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`;
}

function clickScript(selector: string): string {
  return `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (target === null) return false;
    target.click();
    return true;
  })()`;
}

function valueScript(selector: string): string {
  return `(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    return field === null ? "" : field.value;
  })()`;
}

const MEASURE_SCRIPT = `(name) => {
  const rect = (node) => {
    if (node === null) return null;
    const box = node.getBoundingClientRect();
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      height: Math.round(box.height),
    };
  };
  const inside = (box) =>
    box !== null && box.top >= 0 && box.bottom <= window.innerHeight + 1;
  const contentNode = document.querySelector(".popover-content");
  const footerNode = document.querySelector(".popover-footer");
  const copyNode = footerNode === null ? null : footerNode.querySelector(".key-primary");
  const resultNode = document.querySelector(${JSON.stringify(RESULT_FIELD)});
  const promptNode = document.querySelector(${JSON.stringify(PROMPT_FIELD)});
  const zero = { top: 0, bottom: 0, height: 0 };
  const footer = rect(footerNode);
  const copy = rect(copyNode);
  const content = {
    clientHeight: contentNode === null ? 0 : contentNode.clientHeight,
    scrollHeight: contentNode === null ? 0 : contentNode.scrollHeight,
    scrollTop: contentNode === null ? 0 : Math.round(contentNode.scrollTop),
    clientWidth: contentNode === null ? 0 : contentNode.clientWidth,
    scrollWidth: contentNode === null ? 0 : contentNode.scrollWidth,
  };
  return {
    name,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    prompt: rect(promptNode) ?? zero,
    content: {
      clientHeight: content.clientHeight,
      scrollHeight: content.scrollHeight,
      scrollTop: content.scrollTop,
      overflows: content.scrollHeight > content.clientHeight + 1,
      overflowsSideways: content.scrollWidth > content.clientWidth + 1,
    },
    footer: footer ?? zero,
    copy,
    footerVisible: inside(footer),
    copyVisible: inside(copy),
    copyInFooter: copyNode !== null && copyNode.closest(".popover-footer") !== null,
    copyInContent: copyNode !== null && copyNode.closest(".popover-content") !== null,
    resultValue: resultNode === null ? null : resultNode.value,
    resultInContent: resultNode !== null && resultNode.closest(".popover-content") !== null,
    promptInContent: promptNode !== null && promptNode.closest(".popover-content") !== null,
    toast: rect(document.querySelector(${JSON.stringify(TOAST)})),
    documentOverflows:
      document.documentElement.scrollHeight > window.innerHeight + 1 ||
      document.documentElement.scrollWidth > window.innerWidth + 1,
  };
}`;

type RendererMeasure = Omit<PopoverMeasure, "window" | "shot">;

async function measure(
  target: CapsuleUiWindow,
  name: string,
  shotsDir?: string,
): Promise<PopoverMeasure> {
  const fromRenderer = await evaluate<RendererMeasure>(
    target,
    `(${MEASURE_SCRIPT})(${JSON.stringify(name)})`,
  );
  let shot: string | undefined;
  if (shotsDir !== undefined) {
    await mkdir(shotsDir, { recursive: true });
    shot = path.join(shotsDir, `popover-${name}.png`);
    // Deux prises, la seconde gardée. Une fenêtre `panel` qui n'a pas le focus
    // ne recompose pas à chaque appel : la première prise rendait l'image de
    // l'état précédent, et toute la campagne était décalée d'un cran — des
    // captures qui montrent autre chose que ce que les nombres décrivent sont
    // pires qu'aucune capture.
    await target.webContents.capturePage();
    await writeFile(shot, (await target.webContents.capturePage()).toPNG());
  }
  const bounds = target.getBounds();
  return {
    ...fromRenderer,
    window: { width: bounds.width, height: bounds.height },
    ...(shot === undefined ? {} : { shot }),
  };
}

/**
 * Laisse le rendu se poser avant de mesurer.
 *
 * Le nœud d'une annonce existe dès le premier rendu, puis son entrée CSS le
 * rend visible : mesurer dans la foulée décrirait un élément encore
 * transparent. Court et borné — aucune attente ici ne dépend du réseau.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/**
 * Pilote le vrai popover à travers les états qui décident de sa géométrie.
 *
 * L'ordre est celui qui ne laisse rien traîner d'un état sur le suivant :
 * l'annonce vient en dernier, donc aucune mesure n'a à attendre sa sortie.
 */
export async function runPopoverUiScenario(targets: PopoverUiTargets): Promise<PopoverUiReport> {
  targets.open();
  const target = targets.window();
  await waitForSelector(target, PROMPT_FIELD);
  await settle();

  const measures: PopoverMeasure[] = [await measure(target, "empty", targets.shotsDir)];

  await evaluate<boolean>(target, fillScript(PROMPT_FIELD, LONG_PROMPT));
  await evaluate<boolean>(target, clickScript(".popover-reformulate"));
  await waitForSelector(target, RESULT_FIELD);
  await waitForSelector(target, COPY);
  await settle();
  measures.push(await measure(target, "result", targets.shotsDir));

  // Quatorze lignes reprises à la main dans un panneau de 260 px : le contenu
  // absorbe la croissance, le pied ne bouge pas d'un pixel.
  await evaluate<boolean>(target, fillScript(RESULT_FIELD, MULTILINE_EDIT));
  await settle();
  measures.push(await measure(target, "edited", targets.shotsDir));

  // La frappe réelle en bas d'un résultat plus haut que la fenêtre : le champ
  // n'a pas de barre à lui — il grandit, et c'est la zone centrale qui doit
  // suivre le curseur. Sans cela on écrit sous le pied, à l'aveugle.
  await evaluate<boolean>(
    target,
    `(() => {
      const field = document.querySelector(${JSON.stringify(RESULT_FIELD)});
      if (field === null) return false;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
      return true;
    })()`,
  );
  for (const character of ["!", "!", "!"]) {
    target.webContents.sendInputEvent({ type: "char", keyCode: character });
  }
  await settle();
  measures.push(await measure(target, "typing", targets.shotsDir));
  const beforeRerun = await evaluate<string>(target, valueScript(RESULT_FIELD));

  // ⌘⏎ depuis le champ du résultat : la relance part, et la fenêtre n'est pas
  // rechargée — un rechargement jetterait le prompt sans un mot. La frappe est
  // envoyée à la fenêtre réelle, pas fabriquée dans la page.
  const marker = `rq-${String(Date.now())}`;
  await evaluate<boolean>(
    target,
    `(() => { window.__rqAlive = ${JSON.stringify(marker)}; document.querySelector(${JSON.stringify(RESULT_FIELD)})?.focus(); return true })()`,
  );
  target.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return", modifiers: ["meta"] });
  target.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return", modifiers: ["meta"] });
  await waitFor(
    target,
    `(() => {
      const field = document.querySelector(${JSON.stringify(RESULT_FIELD)});
      return field !== null && field.value !== ${JSON.stringify(beforeRerun)};
    })()`,
    "a fresh result after ⌘⏎",
  );
  await settle();
  const alive = await evaluate<string | null>(target, `window.__rqAlive ?? null`);
  const promptAfterRerun = await evaluate<string>(target, valueScript(PROMPT_FIELD));
  measures.push(await measure(target, "rerun", targets.shotsDir));

  // L'annonce, en dernier : le vidage du champ suffit à la déclencher, et le
  // popover refuse de copier un résultat vide sans jamais solliciter le
  // processus principal — donc sans toucher au presse-papiers de la machine.
  await evaluate<boolean>(target, fillScript(RESULT_FIELD, ""));
  await evaluate<boolean>(target, clickScript(COPY));
  await waitForSelector(target, TOAST);
  await settle();
  measures.push(await measure(target, "toast", targets.shotsDir));

  return { measures, reloadedOnRerunShortcut: alive !== marker, promptAfterRerun };
}

/** L'état d'erreur, atteint par un fournisseur que rien ne configure. */
export async function runPopoverErrorScenario(targets: PopoverUiTargets): Promise<PopoverUiReport> {
  targets.open();
  const target = targets.window();
  await waitForSelector(target, PROMPT_FIELD);
  await evaluate<boolean>(target, fillScript(PROMPT_FIELD, "reformule cette demande"));
  await evaluate<boolean>(target, clickScript(".popover-reformulate"));
  await waitForSelector(target, '[role="alert"]');
  await settle();
  return {
    measures: [await measure(target, "error", targets.shotsDir)],
    reloadedOnRerunShortcut: false,
    promptAfterRerun: "",
  };
}
