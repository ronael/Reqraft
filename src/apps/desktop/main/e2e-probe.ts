import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  runCapsuleErrorScenario,
  runCapsuleUiScenario,
  type CapsuleUiReport,
  type CapsuleUiTargets,
  type CapsuleUiWindow,
} from "./e2e-capsule.js";
import {
  runPopoverErrorScenario,
  runPopoverUiScenario,
  type PopoverUiReport,
} from "./e2e-popover.js";
import type { RepromptService } from "./reprompt-service.js";
import type { ShortcutHandlers } from "./shortcuts.js";
import type { CapsuleOpenedPayload, RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Ce que le processus principal fait pour se laisser observer de bout en bout.
 *
 * Les tests e2e lancent le vrai bundle Electron : il n'y a pas d'autre moyen de
 * vérifier que le bundle démarre, que le handler d'un raccourci ouvre la
 * capsule et qu'un run traverse le vrai service principal. Les comportements
 * qui exigeraient une frappe ou le presse-papiers système restent dans les tests
 * d'intégration injectés : une suite automatique ne doit pas modifier l'état de
 * la machine qui la lance.
 *
 * Isolé ici pour deux raisons : `bootstrap` est déjà à la limite de longueur
 * autorisée, et ce code ne doit jamais se mélanger au démarrage normal — hors
 * scénario, rien de ce fichier ne s'exécute.
 */

export const DESKTOP_E2E_PROBE = "REQRAFT_DESKTOP_E2E_PROBE";
export const DESKTOP_E2E_REJECT_SHORTCUTS = "REQRAFT_DESKTOP_E2E_REJECT_SHORTCUTS";
export const DESKTOP_E2E_SCENARIO = "REQRAFT_DESKTOP_E2E_SCENARIO";
export const DESKTOP_E2E_HOLD = "REQRAFT_DESKTOP_E2E_HOLD";
/** Dossier où déposer une capture par état de capsule ; vide = aucune. */
export const DESKTOP_E2E_SHOTS = "REQRAFT_DESKTOP_E2E_SHOTS";

export interface E2eScenarioTargets {
  repromptService: RepromptService;
  shortcutHandlers: ShortcutHandlers;
  capsuleVisible: () => boolean;
  capsulePending: () => CapsuleOpenedPayload | null;
  popoverVisible: () => boolean;
  popoverWindow: () => CapsuleUiWindow;
  settingsWindow: () => CapsuleUiWindow;
  openSettings: (tab?: string) => void;
  setShortcutsSuspended: (suspended: boolean) => void;
  shortcutsSuspended: () => boolean;
  /**
   * La fenêtre capsule elle-même.
   *
   * Les scénarios d'interface pilotent le vrai renderer et mesurent des
   * rectangles rendus : c'est la seule façon de prouver qu'un pied tient dans
   * la fenêtre à 560 px de large. Voir `e2e-capsule.ts`.
   */
  capsuleWindow: () => CapsuleUiWindow;
  /** Les libellés des accélérateurs du menu applicatif, tels qu'installés. */
  menuAccelerators: () => string[];
}

export interface E2eScenarioReport {
  name: string;
  capsuleVisible?: boolean;
  capsuleMode?: string;
  /** Le popover après le premier appui, puis après le second : une bascule. */
  popoverVisible?: boolean;
  popoverHidden?: boolean;
  shortcutsSuspended?: boolean;
  shortcutsResumed?: boolean;
  run?: { rewritten: string; model: string; profile: string };
  /** Les mesures prises dans le vrai renderer (scénarios `capsule-ui*`). */
  ui?: CapsuleUiReport;
  popoverUi?: PopoverUiReport;
  diagnosticUi?: DiagnosticUiReport;
  /** Les accélérateurs que le menu applicatif détient réellement. */
  menuAccelerators?: string[];
  error?: string;
}

export interface DiagnosticUiReport {
  window: { width: number; height: number };
  failedChecks: number;
  actions: number;
  rerunVisible: boolean;
  statusbarVisible: boolean;
  documentOverflows: boolean;
  shot?: string;
}

/**
 * Attend que la condition soit vraie, plutôt qu'un délai fixe.
 *
 * Une attente de 1,5 s passait la plupart du temps et échouait environ une fois
 * sur trois : `trigger()` lance `osascript`, dont le coût dépend de la charge
 * de la machine. Un test qui dépend de la vitesse de l'hôte mesure l'hôte.
 */
async function waitUntil(condition: () => boolean, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return condition();
}

/**
 * La capsule a fini de s'ouvrir.
 *
 * `annonce()` est appelé APRÈS que la capture a rendu la main, donc une
 * ouverture en attente prouve que le cycle complet est terminé — la fenêtre
 * visible seule ne le prouverait pas.
 */
function capsuleOpened(targets: E2eScenarioTargets): boolean {
  return targets.capsulePending() !== null && targets.capsuleVisible();
}

export async function runE2eScenario(
  name: string,
  targets: E2eScenarioTargets,
): Promise<E2eScenarioReport> {
  try {
    switch (name) {
      case "capsule":
        return await capsuleScenario(name, targets);
      case "popover":
        return await popoverScenario(name, targets);
      case "suspension":
        return suspensionScenario(name, targets);
      case "run":
        return await runScenario(name, targets);
      case "capsule-ui":
        return {
          name,
          ui: await runCapsuleUiScenario(uiTargets(targets)),
          menuAccelerators: targets.menuAccelerators(),
        };
      case "capsule-error":
        return { name, ui: await runCapsuleErrorScenario(uiTargets(targets)) };
      case "popover-ui":
        return { name, popoverUi: await runPopoverUiScenario(popoverTargets(targets)) };
      case "popover-error":
        return { name, popoverUi: await runPopoverErrorScenario(popoverTargets(targets)) };
      case "settings-diagnostic":
        return { name, diagnosticUi: await diagnosticScenario(targets) };
      default:
        return { name, error: `unknown scenario: ${name}` };
    }
  } catch (cause) {
    return { name, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** Ouvre et mesure le Diagnostic dans la vraie fenêtre de réglages. */
async function diagnosticScenario(targets: E2eScenarioTargets): Promise<DiagnosticUiReport> {
  targets.openSettings("diagnostic");
  const target = targets.settingsWindow();
  await waitForRenderer(
    target,
    `document.querySelector(".diagnostic-row:not(.diagnostic-row-skeleton)") !== null && document.querySelector(".diagnostic-head-actions [aria-busy=true]") === null`,
    "completed diagnostic",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const measured = (await target.webContents.executeJavaScript(
    `(() => {
    const inside = (node) => {
      if (node === null) return false;
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
    };
    return {
      window: { width: window.innerWidth, height: window.innerHeight },
      failedChecks: document.querySelectorAll(".diagnostic-row-risk").length,
      actions: document.querySelectorAll(".diagnostic-row-actions button").length,
      rerunVisible: inside(document.querySelector(".diagnostic-head-actions button:last-child")),
      statusbarVisible: inside(document.querySelector(".settings-statusbar")),
      documentOverflows:
        document.documentElement.scrollHeight > window.innerHeight + 1 ||
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  })()`,
    true,
  )) as Omit<DiagnosticUiReport, "shot">;
  const directory = process.env[DESKTOP_E2E_SHOTS];
  if (directory === undefined || directory === "") return measured;
  await mkdir(directory, { recursive: true });
  const shot = path.join(directory, "settings-diagnostic.png");
  await writeFile(shot, (await target.webContents.capturePage()).toPNG());
  return { ...measured, shot };
}

async function waitForRenderer(
  target: CapsuleUiWindow,
  expression: string,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await target.webContents.executeJavaScript(`Boolean(${expression})`, true)) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/** Ce dont les scénarios d'interface ont besoin, extrait des cibles. */
function uiTargets(targets: E2eScenarioTargets): CapsuleUiTargets {
  return {
    capsuleWindow: targets.capsuleWindow,
    openInput: () => {
      targets.shortcutHandlers.onInput();
    },
    ...shotsDir(),
  };
}

/** Les mêmes, pour la fenêtre du popover. */
function popoverTargets(targets: E2eScenarioTargets): Parameters<typeof runPopoverUiScenario>[0] {
  return {
    window: targets.popoverWindow,
    open: targets.shortcutHandlers.onPopover,
    ...shotsDir(),
  };
}

/** Le dossier de captures demandé, ou rien du tout. */
function shotsDir(): { shotsDir?: string } {
  const directory = process.env[DESKTOP_E2E_SHOTS];
  return directory === undefined || directory === "" ? {} : { shotsDir: directory };
}

/** Le chemin du raccourci de saisie ouvre la vraie capsule sans toucher à l'OS. */
async function capsuleScenario(
  name: string,
  targets: E2eScenarioTargets,
): Promise<E2eScenarioReport> {
  targets.shortcutHandlers.onInput();
  await waitUntil(() => capsuleOpened(targets));

  return {
    name,
    capsuleVisible: targets.capsuleVisible(),
    capsuleMode: targets.capsulePending()?.mode,
  };
}

function suspensionScenario(name: string, targets: E2eScenarioTargets): E2eScenarioReport {
  targets.setShortcutsSuspended(true);
  const suspended = targets.shortcutsSuspended();
  targets.setShortcutsSuspended(false);
  return {
    name,
    shortcutsSuspended: suspended,
    shortcutsResumed: !targets.shortcutsSuspended(),
  };
}

/**
 * Le raccourci du popover ouvre la vraie fenêtre, puis la referme.
 *
 * Les deux mesures comptent : sans la seconde, un handler qui n'aurait su
 * qu'ouvrir passerait le test, et le raccourci ne serait plus une bascule mais
 * une porte à sens unique — l'icône du tray restant le seul moyen de refermer.
 */
async function popoverScenario(
  name: string,
  targets: E2eScenarioTargets,
): Promise<E2eScenarioReport> {
  targets.shortcutHandlers.onPopover();
  await waitUntil(() => targets.popoverVisible());
  const opened = targets.popoverVisible();

  targets.shortcutHandlers.onPopover();
  await waitUntil(() => !targets.popoverVisible());

  return { name, popoverVisible: opened, popoverHidden: !targets.popoverVisible() };
}

/** Un run complet, du démarrage au résultat, à travers le service réel. */
async function runScenario(name: string, targets: E2eScenarioTargets): Promise<E2eScenarioReport> {
  const result = await new Promise<RepromptResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("run scenario timed out"));
    }, 10_000);
    const sender = {
      isDestroyed: () => false,
      send(channel: string, payload: unknown) {
        if (channel.endsWith(":done")) {
          clearTimeout(timer);
          resolve((payload as { result: RepromptResult }).result);
        }
        if (channel.endsWith(":error")) {
          clearTimeout(timer);
          reject(new Error(JSON.stringify(payload)));
        }
      },
    };
    void targets.repromptService
      .start({ input: "je voudrais quon fasse le point demain", level: "standard" }, sender)
      .catch((cause: unknown) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      });
  });

  return {
    name,
    run: { rewritten: result.rewritten, model: result.model, profile: result.profile },
  };
}
