/**
 * Ce que la capsule mesure d'elle-même, dans le vrai renderer.
 *
 * Les tests d'interface d'un produit Electron se paient d'ordinaire en relisant
 * la source : « la feuille de style contient bien telle règle ». Cela ne prouve
 * rien sur la hauteur réelle d'un pied à 560 px de large. Ce module pilote la
 * vraie fenêtre — vrai preload, vrai IPC, vrai moteur derrière le fournisseur
 * `mock` — et rend des rectangles mesurés par le moteur de rendu.
 *
 * Il ne s'exécute que sous `REQRAFT_DESKTOP_E2E_PROBE` : hors scénario, rien
 * de ce fichier ne tourne.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Le strict nécessaire d'une `BrowserWindow` pour piloter et mesurer. */
export interface CapsuleUiWindow {
  getBounds(): { x: number; y: number; width: number; height: number };
  webContents: {
    /** La capture de la fenêtre, pour regarder ce que les nombres décrivent. */
    capturePage(): Promise<{ toPNG(): Buffer }>;
    executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
    /** La frappe telle que la fenêtre la reçoit, pas un événement fabriqué. */
    sendInputEvent(event: {
      /** `char` est le caractère saisi : c'est lui qui fait avancer le curseur. */
      type: "keyDown" | "keyUp" | "char";
      keyCode: string;
      modifiers?: ("meta" | "shift" | "control" | "alt")[];
    }): void;
  };
}

export interface CapsuleUiTargets {
  /** La fenêtre capsule vivante, celle que les raccourcis ouvrent. */
  capsuleWindow: () => CapsuleUiWindow;
  /** Le handler du raccourci de saisie libre : la seule porte d'ouverture. */
  openInput: () => void;
  /**
   * Où déposer une capture par état, ou `undefined` pour n'en prendre aucune.
   *
   * Les nombres disent que le pied tient dans la fenêtre ; ils ne disent pas
   * que le résultat est agréable à lire. Les captures servent à la relecture
   * humaine, pas aux assertions — la suite automatique n'écrit rien par défaut.
   */
  shotsDir?: string;
}

/** Un rectangle tel que le moteur de rendu le donne, arrondi au pixel. */
export interface Rect {
  top: number;
  bottom: number;
  height: number;
}

/** Ce qu'un état de la capsule occupe réellement à l'écran. */
export interface CapsuleMeasure {
  name: string;
  window: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  band: Rect;
  footer: Rect;
  bar: Rect;
  body: { clientHeight: number; scrollHeight: number; scrollTop: number; overflows: boolean };
  /**
   * La hauteur que le contenu demanderait sans borne.
   *
   * C'est l'entrée d'une décision de hauteur adaptative : bandeau + barre +
   * corps déroulé + pied. Elle est prise dans le rendu réel, jamais estimée à
   * partir d'un nombre de caractères.
   */
  naturalHeight: number;
  /** Le pied tient-il entièrement dans la fenêtre ? */
  footerVisible: boolean;
  /** Le vide sous le contenu quand il n'occupe pas toute la hauteur offerte. */
  slack: number;
  toast: Rect | null;
  /** Le fichier PNG écrit pour cet état, quand les captures sont demandées. */
  shot?: string;
}

export interface CapsuleUiReport {
  measures: CapsuleMeasure[];
  /** `⌘R` pendant l'édition a-t-il rechargé la fenêtre ? */
  reloadedOnRerunShortcut: boolean;
  /** Le nombre de runs ouverts après la frappe : la relance a-t-elle eu lieu ? */
  textAfterRerunShortcut: string;
  error?: string;
}

const MOUNTED = ".capsule";
const INPUT = "textarea.capsule-input";
const RESULT = "textarea.result-editor-input";
const DIFF = ".capsule-diff";
const TOAST = ".toast";
const SUBMIT = ".capsule-hint-key";
const COMPARE = ".capsule-keys .capsule-key[aria-pressed]";

async function evaluate<T>(target: CapsuleUiWindow, code: string): Promise<T> {
  return (await target.webContents.executeJavaScript(code, true)) as T;
}

/** Attend qu'un sélecteur existe dans le renderer, sans délai fixe. */
async function waitForSelector(
  target: CapsuleUiWindow,
  selector: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await evaluate<boolean>(
      target,
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    );
    if (found) return;
    if (Date.now() >= deadline) {
      const context = await evaluate<string>(
        target,
        `JSON.stringify({ url: location.href, ready: document.readyState, body: document.body.innerHTML.slice(0, 300) })`,
      );
      throw new Error(`timed out waiting for ${selector} — ${context}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/** Attend qu'un élément transitoire ait réellement quitté le renderer. */
async function waitForSelectorToDisappear(
  target: CapsuleUiWindow,
  selector: string,
  // Toast.tsx borne la lecture à 6 s ; le pilote doit laisser au composant son
  // délai maximal, plus une marge de rendu, quelle que soit la langue active.
  timeoutMs = 7_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await evaluate<boolean>(
      target,
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    );
    if (!found) return;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${selector} to disappear`);
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
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
    return document.activeElement === field;
  })()`;
}

async function fill(target: CapsuleUiWindow, selector: string, text: string): Promise<void> {
  if (!(await evaluate<boolean>(target, fillScript(selector, text)))) {
    throw new Error(`could not fill ${selector}`);
  }
}

async function blurField(target: CapsuleUiWindow, selector: string): Promise<void> {
  const blurred = await evaluate<boolean>(
    target,
    `(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (field === null) return false;
      field.blur();
      return document.activeElement !== field;
    })()`,
  );
  if (!blurred) throw new Error(`could not blur ${selector}`);
}

/**
 * Clique la commande du pied qui porte cette touche.
 *
 * `element.click()` n'emmène pas le focus, contrairement à un vrai clic : le
 * curseur reste dans le champ, donc la géométrie reste gelée. C'est exactement
 * ce qu'il faut pour observer une annonce sans changer la taille de la fenêtre
 * au même instant.
 */
function clickCommandScript(key: string): string {
  return `(() => {
    const keys = [...document.querySelectorAll(".capsule-keys .capsule-key")];
    const target = keys.find((node) => node.querySelector("kbd")?.textContent === ${JSON.stringify(key)});
    if (target === undefined) return false;
    target.click();
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

/**
 * La mesure, prise dans le renderer.
 *
 * `naturalHeight` déroule le corps : c'est la hauteur que la capsule aurait si
 * rien ne la bornait, donc l'entrée d'une décision de hauteur adaptative.
 */
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
  const band = rect(document.querySelector(".capsule-band"));
  const footerNode =
    document.querySelector(".capsule-footer") ?? document.querySelector(".capsule-hints");
  const footer = rect(footerNode);
  const bar = rect(document.querySelector(".capsule-bar"));
  const bodyNode = document.querySelector(".capsule-body");
  const contentNode = bodyNode === null ? null : bodyNode.querySelector(":scope > .capsule-content");
  const body = {
    clientHeight: bodyNode === null ? 0 : bodyNode.clientHeight,
    scrollHeight: bodyNode === null ? 0 : bodyNode.scrollHeight,
    scrollTop: bodyNode === null ? 0 : Math.round(bodyNode.scrollTop),
  };
  // La même formule que useCapsuleHeight utilise pour se redimensionner : le
  // bloc intrinsèque, plus tout ce qui n'est pas le corps. Mesurer scrollHeight
  // rendrait la hauteur courante quand le contenu est plus court que la boîte.
  const bodyStyles = bodyNode === null ? null : getComputedStyle(bodyNode);
  const padding =
    bodyStyles === null
      ? 0
      : parseFloat(bodyStyles.paddingTop) + parseFloat(bodyStyles.paddingBottom);
  const natural =
    contentNode === null
      ? 0
      : window.innerHeight -
        body.clientHeight +
        contentNode.getBoundingClientRect().height +
        padding;
  const zero = { top: 0, bottom: 0, height: 0 };
  return {
    name,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    band: band ?? zero,
    footer: footer ?? zero,
    bar: bar ?? zero,
    body: { ...body, overflows: body.scrollHeight > body.clientHeight + 1 },
    naturalHeight: Math.round(natural),
    footerVisible:
      footer !== null && footer.bottom <= window.innerHeight + 1 && footer.top >= 0,
    slack: Math.max(0, body.clientHeight - body.scrollHeight),
    toast: rect(document.querySelector(".toast")),
  };
}`;

type RendererMeasure = Omit<CapsuleMeasure, "window" | "shot">;

async function measure(
  target: CapsuleUiWindow,
  name: string,
  shotsDir?: string,
): Promise<CapsuleMeasure> {
  const fromRenderer = await evaluate<RendererMeasure>(
    target,
    `(${MEASURE_SCRIPT})(${JSON.stringify(name)})`,
  );
  const shot = shotsDir === undefined ? undefined : await capture(target, name, shotsDir);
  return { ...fromRenderer, window: target.getBounds(), ...(shot === undefined ? {} : { shot }) };
}

async function capture(target: CapsuleUiWindow, name: string, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `capsule-${name}.png`);
  await writeFile(file, (await target.webContents.capturePage()).toPNG());
  return file;
}

/** Ouvre une session de saisie libre et attend que le champ soit là. */
async function openFreshInput(targets: CapsuleUiTargets): Promise<CapsuleUiWindow> {
  targets.openInput();
  const target = targets.capsuleWindow();
  await waitForSelector(target, MOUNTED);
  await waitForSelector(target, INPUT);
  await settle();
  return target;
}

/** Un aller complet : saisie, run réel, résultat affiché. */
async function runOnce(targets: CapsuleUiTargets, prompt: string): Promise<CapsuleUiWindow> {
  const target = await openFreshInput(targets);
  await fill(target, INPUT, prompt);
  await evaluate<boolean>(target, clickScript(SUBMIT));
  await waitForSelector(target, RESULT);
  await settle();
  return target;
}

/** Les longueurs de résultat qui décident de la géométrie. */
const FIXTURES: { name: string; prompt: string }[] = [
  { name: "short", prompt: "corrige cette phrase" },
  {
    name: "medium",
    prompt:
      "prepare un point d equipe pour demain matin avec les trois sujets en cours, " +
      "les blocages connus et ce qu il reste a decider avant la fin de la semaine",
  },
  {
    name: "long",
    prompt: Array.from(
      { length: 18 },
      (_, index) =>
        `point ${String(index + 1)} : detailler ce qui a ete fait, ce qui bloque et la suite attendue`,
    ).join("\n"),
  },
];

const MULTILINE_EDIT = Array.from(
  { length: 14 },
  (_, index) => `ligne editee ${String(index + 1)}`,
).join("\n");

export async function runCapsuleUiScenario(targets: CapsuleUiTargets): Promise<CapsuleUiReport> {
  const measures: CapsuleMeasure[] = [];

  const input = await openFreshInput(targets);
  measures.push(await measure(input, "input", targets.shotsDir));

  let target = input;
  for (const fixture of FIXTURES) {
    target = await runOnce(targets, fixture.prompt);
    measures.push(await measure(target, fixture.name, targets.shotsDir));
    measures.push(await measureToast(target, fixture.name, targets.shotsDir));
  }

  // Édition multiligne sur un résultat long : la fenêtre est déjà au plafond,
  // le corps doit absorber la croissance sans que rien ne bouge.
  await fill(target, RESULT, MULTILINE_EDIT);
  await settle();
  measures.push(await measure(target, "editing-long", targets.shotsDir));

  // La relance au clavier pendant l'édition : ni commande Reqraft, ni
  // rechargement de la fenêtre. Une vraie frappe, pas un événement fabriqué.
  const marker = `rq-${String(Date.now())}`;
  await evaluate<boolean>(
    target,
    `(() => { window.__rqAlive = ${JSON.stringify(marker)}; true })()`,
  );
  target.webContents.sendInputEvent({ type: "keyDown", keyCode: "r", modifiers: ["meta"] });
  target.webContents.sendInputEvent({ type: "keyUp", keyCode: "r", modifiers: ["meta"] });
  await settle();
  const alive = await evaluate<string | null>(target, `window.__rqAlive ?? null`);
  const textAfterRerunShortcut = await evaluate<string>(target, valueScript(RESULT));

  // Comparaison : deux blocs empilés, l'état le plus haut du produit.
  await evaluate<boolean>(target, clickScript(COMPARE));
  await waitForSelector(target, DIFF);
  await settle();
  measures.push(await measure(target, "comparison", targets.shotsDir));

  // Retour à `ready` sur le même résultat : la fenêtre doit retrouver
  // exactement les bornes qu'elle avait. C'est la preuve qu'un aller-retour
  // ne fait pas dériver la fenêtre — la position est recalculée depuis
  // l'ancre, jamais depuis la position précédente.
  await evaluate<boolean>(target, clickScript(COMPARE));
  await waitForSelector(target, RESULT);
  await settle();
  measures.push(await measure(target, "long-again", targets.shotsDir));

  // Le cas risqué de l'adaptation : un résultat court, donc une petite
  // fenêtre, dans laquelle on colle quatorze lignes. Rien ne doit bouger, et
  // le pied doit rester visible.
  target = await runOnce(targets, FIXTURES[0]?.prompt ?? "corrige cette phrase");
  measures.push(await measure(target, "short-again", targets.shotsDir));
  await fill(target, RESULT, MULTILINE_EDIT);
  await settle();
  measures.push(await measure(target, "editing-short", targets.shotsDir));

  // Le champ rend la main : c'est là, et seulement là, que la capsule se
  // réajuste au texte repris. Un seul mouvement, après la frappe.
  await blurField(target, RESULT);
  await settle();
  measures.push(await measure(target, "edited-short-blurred", targets.shotsDir));

  return { measures, reloadedOnRerunShortcut: alive !== marker, textAfterRerunShortcut };
}

/**
 * L'annonce, dans la fenêtre telle qu'elle est.
 *
 * Le vidage du champ suffit à la déclencher : la capsule refuse d'appliquer un
 * résultat vide et le dit, sans jamais solliciter le processus principal — donc
 * sans toucher au presse-papiers de la machine qui exécute la suite. Le champ
 * garde le focus pendant l'opération, donc la hauteur reste celle de l'état
 * mesuré juste avant, et l'annonce est jugée dans cette fenêtre-là.
 */
async function measureToast(
  target: CapsuleUiWindow,
  name: string,
  shotsDir?: string,
): Promise<CapsuleMeasure> {
  const restored = await evaluate<string>(target, valueScript(RESULT));
  await fill(target, RESULT, "");
  await evaluate<boolean>(target, clickCommandScript("⌘C"));
  await waitForSelector(target, TOAST);
  // Le nœud existe dès le premier rendu, puis son entrée CSS devient visible.
  // Mesurer et capturer après stabilisation prouve l'état peint, pas seulement
  // la présence d'un élément encore transparent dans le DOM.
  await settle();
  const measured = await measure(target, `${name}-toast`, shotsDir);
  await fill(target, RESULT, restored);
  await blurField(target, RESULT);
  // La campagne réutilise la même fenêtre pour l'état suivant. Attendre la
  // sortie réelle du toast évite de polluer sa mesure et sa capture avec une
  // annonce appartenant au cas précédent.
  await waitForSelectorToDisappear(target, TOAST);
  await settle();
  return measured;
}

/**
 * Laisse le redimensionnement traverser l'IPC avant de mesurer.
 *
 * La hauteur part du renderer, revient par le processus principal et arrive
 * par `setBounds` : mesurer dans la foulée mesurerait l'état d'avant. Les
 * assertions portent sur la valeur stabilisée, pas sur le trajet.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

/** L'état d'erreur, atteint par un fournisseur que rien ne configure. */
export async function runCapsuleErrorScenario(targets: CapsuleUiTargets): Promise<CapsuleUiReport> {
  const target = await openFreshInput(targets);
  await fill(target, INPUT, "reformule cette demande");
  await evaluate<boolean>(target, clickScript(SUBMIT));
  await waitForSelector(target, '[role="alert"]');
  await settle();
  return {
    measures: [await measure(target, "error", targets.shotsDir)],
    reloadedOnRerunShortcut: false,
    textAfterRerunShortcut: "",
  };
}
