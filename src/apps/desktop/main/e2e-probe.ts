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

export interface E2eScenarioTargets {
  repromptService: RepromptService;
  shortcutHandlers: ShortcutHandlers;
  capsuleVisible: () => boolean;
  capsulePending: () => CapsuleOpenedPayload | null;
  popoverVisible: () => boolean;
}

export interface E2eScenarioReport {
  name: string;
  capsuleVisible?: boolean;
  capsuleMode?: string;
  /** Le popover après le premier appui, puis après le second : une bascule. */
  popoverVisible?: boolean;
  popoverHidden?: boolean;
  run?: { rewritten: string; model: string; profile: string };
  error?: string;
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
      case "run":
        return await runScenario(name, targets);
      default:
        return { name, error: `unknown scenario: ${name}` };
    }
  } catch (cause) {
    return { name, error: cause instanceof Error ? cause.message : String(cause) };
  }
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
