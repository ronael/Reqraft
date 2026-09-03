import { render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { expect, vi, type Mock } from "vitest";
import { App } from "@/apps/desktop/renderer/capsule/App.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import { DESKTOP_EN } from "@/i18n/desktop/en.js";
import type {
  CapsuleOpenedPayload,
  CaptureSelectionResponse,
  ProfileCatalogEntry,
  ProfileCatalogResponse,
  RepromptResult,
  RepromptStartRequest,
  RepromptStartResponse,
  ReqraftBridge,
  ResultAcceptMode,
  ResultAcceptResponse,
  RunDeltaPayload,
  RunDonePayload,
  RunErrorPayload,
  UiError,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * La capsule montée pour de vrai, avec le seul contact qu'elle a avec le
 * dehors : `window.reqraft`.
 *
 * Les tests d'édition relisaient la source du composant — ce qui prouve qu'une
 * ligne existe, jamais qu'elle produit le comportement attendu. Ici la capsule
 * est rendue dans un DOM, on tape dedans, on appuie sur les touches, et ce
 * qu'on vérifie est ce que le pont reçoit. Le pont est le bon endroit où
 * couper : c'est exactement la frontière que le renderer a en production, et
 * tout ce qui est au-dessus — React, la machine à états, le clavier, le rendu
 * — est le vrai code du produit.
 */

export const DEFAULT_CAPTURE_TEXT = "fais moi un point demain sur le projet";

/** Les libellés anglais réels : les tests interrogent ce que l'on voit. */
export const EN = DESKTOP_EN;

/** Ce que le pont a reçu, dans l'ordre, pour chaque canal qui compte. */
export interface CapsuleBridgeSpies {
  startReprompt: Mock<(request: RepromptStartRequest) => Promise<RepromptStartResponse>>;
  acceptResult: Mock<
    (runId: string, mode: ResultAcceptMode, text?: string) => Promise<ResultAcceptResponse>
  >;
  cancelReprompt: Mock<(runId: string) => Promise<void>>;
  captureSelection: Mock<() => Promise<CaptureSelectionResponse>>;
  /**
   * Les demandes de hauteur.
   *
   * Espionnées comme le reste : ce qui compte n'est pas la valeur — jsdom n'a
   * pas de mise en page — mais le NOMBRE d'appels. Une demande par frappe est
   * exactement l'oscillation que la règle de hauteur interdit.
   */
  resizeCapsule: Mock<(height: number) => Promise<void>>;
}

/** Les messages que le processus principal pousse vers la capsule. */
export interface CapsulePush {
  opened(payload: CapsuleOpenedPayload): void;
  delta(payload: RunDeltaPayload): void;
  done(payload: RunDonePayload): void;
  error(payload: RunErrorPayload): void;
  cancelled(runId: string): void;
}

export interface CapsuleHarness {
  readonly bridge: CapsuleBridgeSpies;
  readonly push: CapsulePush;
  readonly user: UserEvent;
  /** `window.close()`, remplacé : fermer la fenêtre jsdom couperait le test. */
  readonly closed: Mock<() => void>;
  /** L'identifiant du dernier run ouvert, celui que le pont a rendu. */
  dernierRunId(): string;
  view: RenderResult;
}

export interface CapsuleHarnessOptions {
  /** Le catalogue de profils ; vide par défaut, le sélecteur reste fermé. */
  profiles?: ProfileCatalogEntry[];
  /** La sélection rendue par `capture:selection`. */
  capture?: CaptureSelectionResponse;
  /** L'ouverture en attente au montage ; capture par défaut. */
  pending?: CapsuleOpenedPayload | null;
  /** Ce que `result:accept` répond, remplacement compris. */
  accept?: ResultAcceptResponse;
}

/** Un catalogue vide : le sélecteur de profils n'est pas le sujet ici. */
const EMPTY_CATALOG: ProfileCatalogResponse = { entries: [], problems: [] };

const DEFAULT_CAPTURE: CaptureSelectionResponse = {
  text: DEFAULT_CAPTURE_TEXT,
  sourceApp: "Notes",
};

/**
 * Un résultat complet, prêt à être poussé.
 *
 * Le texte est un paramètre parce que sa longueur est un sujet à part entière :
 * un résultat court ne doit pas laisser de vide, un résultat long doit
 * défiler.
 */
export function repromptResult(rewritten: string, original = DEFAULT_CAPTURE_TEXT): RepromptResult {
  return {
    original,
    rewritten,
    profile: "writing",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: [],
    quality: { status: "good", signals: [] },
    latencyMs: 1200,
  };
}

export function uiError(message: string): UiError {
  return { title: "Error", message };
}

interface Listeners {
  opened: ((payload: CapsuleOpenedPayload) => void)[];
  delta: ((payload: RunDeltaPayload) => void)[];
  done: ((payload: RunDonePayload) => void)[];
  error: ((payload: RunErrorPayload) => void)[];
  cancelled: ((payload: { runId: string }) => void)[];
}

function subscription<T>(
  list: ((payload: T) => void)[],
  listener: (payload: T) => void,
): () => void {
  list.push(listener);
  return () => {
    const index = list.indexOf(listener);
    if (index !== -1) list.splice(index, 1);
  };
}

/** Monte la capsule et rend de quoi la piloter. */
export function monterCapsule(options: CapsuleHarnessOptions = {}): CapsuleHarness {
  const listeners: Listeners = { opened: [], delta: [], done: [], error: [], cancelled: [] };
  let runs = 0;

  const startReprompt: CapsuleBridgeSpies["startReprompt"] = vi.fn(() => {
    runs += 1;
    return Promise.resolve({ runId: `run-${String(runs)}`, requestedProfile: "writing" });
  });
  const acceptResult: CapsuleBridgeSpies["acceptResult"] = vi.fn(() =>
    Promise.resolve(options.accept ?? { applied: true }),
  );
  const cancelReprompt: CapsuleBridgeSpies["cancelReprompt"] = vi.fn(() => Promise.resolve());
  const captureSelection: CapsuleBridgeSpies["captureSelection"] = vi.fn(() =>
    Promise.resolve(options.capture ?? DEFAULT_CAPTURE),
  );
  const resizeCapsule: CapsuleBridgeSpies["resizeCapsule"] = vi.fn(() => Promise.resolve());

  const pending: CapsuleOpenedPayload | null =
    options.pending === undefined ? { id: 1, mode: "capture" } : options.pending;

  const partial = {
    startReprompt,
    acceptResult,
    cancelReprompt,
    captureSelection,
    resizeCapsule,
    profileCatalog: () =>
      Promise.resolve(
        options.profiles === undefined
          ? EMPTY_CATALOG
          : { entries: options.profiles, problems: [] },
      ),
    openSettings: () => Promise.resolve(),
    readLocale: () => Promise.resolve({ locale: "en" as const, messages: DESKTOP_EN }),
    capsulePending: () => Promise.resolve(pending),
    onCapsuleOpened: (listener: (payload: CapsuleOpenedPayload) => void) =>
      subscription(listeners.opened, listener),
    onRunDelta: (listener: (payload: RunDeltaPayload) => void) =>
      subscription(listeners.delta, listener),
    onRunDone: (listener: (payload: RunDonePayload) => void) =>
      subscription(listeners.done, listener),
    onRunError: (listener: (payload: RunErrorPayload) => void) =>
      subscription(listeners.error, listener),
    onRunCancelled: (listener: (payload: { runId: string }) => void) =>
      subscription(listeners.cancelled, listener),
  };

  // Le pont réel porte une quarantaine de fonctions ; la capsule en touche
  // douze. Les autres restent absentes plutôt que remplies de vide : un appel
  // inattendu doit échouer bruyamment, pas rendre `undefined`.
  window.reqraft = partial as unknown as ReqraftBridge;

  const closed = vi.fn();
  window.close = closed;

  const view = render(
    <TranslationProvider>
      <App />
    </TranslationProvider>,
  );

  const diffuser = <T,>(list: ((payload: T) => void)[], payload: T): void => {
    for (const listener of [...list]) listener(payload);
  };

  return {
    bridge: { startReprompt, acceptResult, cancelReprompt, captureSelection, resizeCapsule },
    push: {
      opened: (payload) => {
        diffuser(listeners.opened, payload);
      },
      delta: (payload) => {
        diffuser(listeners.delta, payload);
      },
      done: (payload) => {
        diffuser(listeners.done, payload);
      },
      error: (payload) => {
        diffuser(listeners.error, payload);
      },
      cancelled: (runId) => {
        diffuser(listeners.cancelled, { runId });
      },
    },
    user: userEvent.setup({ document }),
    closed,
    dernierRunId: () => `run-${String(runs)}`,
    view,
  };
}

/** Le champ du résultat, tel que la synthèse vocale le trouve. */
export function champResultat(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>(EN["capsule.editLabel"]);
}

/** Le champ du prompt de départ. */
export function champPrompt(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>(EN["capsule.editPromptLabel"]);
}

/** Une commande du pied, par son libellé. */
export function commande(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(label, "i") });
}

/**
 * Le trajet complet jusqu'au résultat : capture, run, résultat.
 *
 * Les mêmes chemins que le produit — aucun état n'est posé de force.
 */
export async function arriveAuResultat(
  harness: CapsuleHarness,
  rewritten: string,
): Promise<RepromptResult> {
  await waitFor(() => {
    expect(harness.bridge.startReprompt).toHaveBeenCalledTimes(1);
  });
  return await pousserResultat(harness, rewritten);
}

/**
 * Termine le run en cours et attend que le champ affiche son texte.
 *
 * La livraison est retentée jusqu'à ce qu'elle porte : le renderer n'apprend
 * son `runId` que lorsque `reprompt:start` a répondu, et un résultat poussé
 * avant est correctement ignoré — c'est le filtrage par `runId` du contrat qui
 * le veut. Un `run:done` répété est sans effet : `result-complete` n'est pas
 * une transition de `ready`.
 */
export async function pousserResultat(
  harness: CapsuleHarness,
  rewritten: string,
): Promise<RepromptResult> {
  const result = repromptResult(rewritten);
  await waitFor(() => {
    harness.push.done({ runId: harness.dernierRunId(), result });
    expect(champResultat().value).toBe(rewritten);
  });
  return result;
}

/**
 * Rend le focus au document.
 *
 * Les commandes de la capsule sont suspendues tant que le curseur est dans un
 * champ : sans cette sortie, une frappe testée après une saisie mesurerait la
 * suspension et non la commande.
 */
export async function sortirDeLEdition(harness: CapsuleHarness): Promise<void> {
  await harness.user.click(screen.getByText(EN["capsule.before"]));
}

/**
 * Les frappes vues par la fenêtre, une fois la capsule passée dessus.
 *
 * L'écouteur est posé après le montage, donc après celui de la capsule :
 * `defaultPrevented` dit alors ce que la capsule a décidé. C'est la seule
 * façon de vérifier qu'un `⌘R` pendant l'édition ne recharge pas la fenêtre —
 * le rechargement lui-même n'existe pas hors d'Electron.
 */
export function espionnerFrappes(): KeyboardEvent[] {
  const frappes: KeyboardEvent[] = [];
  window.addEventListener("keydown", (event) => {
    frappes.push(event);
  });
  return frappes;
}
