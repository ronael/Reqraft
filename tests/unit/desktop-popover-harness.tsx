import { render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { expect, vi, type Mock } from "vitest";
import { PopoverApp } from "@/apps/desktop/renderer/popover/PopoverApp.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import { DESKTOP_EN } from "@/i18n/desktop/en.js";
import type {
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
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Le popover monté pour de vrai, avec le seul contact qu'il a avec le dehors :
 * `window.reqraft`.
 *
 * Même règle que pour la capsule (`desktop-capsule-harness.tsx`) : on écrit
 * dans les champs, on appuie sur les touches, et ce que l'on vérifie est ce
 * que le pont reçoit — c'est-à-dire exactement ce que le processus principal
 * copierait. Rien ici ne relit la source du composant ; une ligne présente ne
 * prouve pas un comportement.
 */

/** Les libellés anglais réels : les tests interrogent ce que l'on voit. */
export const EN = DESKTOP_EN;

export interface PopoverBridgeSpies {
  startReprompt: Mock<(request: RepromptStartRequest) => Promise<RepromptStartResponse>>;
  acceptResult: Mock<
    (runId: string, mode: ResultAcceptMode, text?: string) => Promise<ResultAcceptResponse>
  >;
  openSettings: Mock<() => Promise<void>>;
}

export interface PopoverPush {
  delta(payload: RunDeltaPayload): void;
  done(payload: RunDonePayload): void;
  error(payload: RunErrorPayload): void;
  cancelled(runId: string): void;
}

export interface PopoverHarness {
  readonly bridge: PopoverBridgeSpies;
  readonly push: PopoverPush;
  readonly user: UserEvent;
  /** L'identifiant du dernier run ouvert, celui que le pont a rendu. */
  dernierRunId(): string;
  view: RenderResult;
}

export interface PopoverHarnessOptions {
  profiles?: ProfileCatalogEntry[];
  /** Ce que `result:accept` répond. */
  accept?: ResultAcceptResponse;
}

const EMPTY_CATALOG: ProfileCatalogResponse = { entries: [], problems: [] };

export function repromptResult(rewritten: string, original = "note brute"): RepromptResult {
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

interface Listeners {
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

/**
 * Monte le popover et attend que les libellés soient là.
 *
 * Ils arrivent du processus principal par `readLocale`, donc après le premier
 * rendu : interroger l'écran avant trouverait les clés brutes, ce que
 * l'utilisateur ne voit jamais.
 */
export async function monterPopover(options: PopoverHarnessOptions = {}): Promise<PopoverHarness> {
  const listeners: Listeners = { delta: [], done: [], error: [], cancelled: [] };
  let runs = 0;

  const startReprompt: PopoverBridgeSpies["startReprompt"] = vi.fn(() => {
    runs += 1;
    return Promise.resolve({ runId: `run-${String(runs)}`, requestedProfile: "writing" });
  });
  const acceptResult: PopoverBridgeSpies["acceptResult"] = vi.fn(() =>
    Promise.resolve(options.accept ?? { applied: true }),
  );
  const openSettings: PopoverBridgeSpies["openSettings"] = vi.fn(() => Promise.resolve());

  const partial = {
    startReprompt,
    acceptResult,
    openSettings,
    profileCatalog: () =>
      Promise.resolve(
        options.profiles === undefined
          ? EMPTY_CATALOG
          : { entries: options.profiles, problems: [] },
      ),
    readLocale: () => Promise.resolve({ locale: "en" as const, messages: DESKTOP_EN }),
    onRunDelta: (listener: (payload: RunDeltaPayload) => void) =>
      subscription(listeners.delta, listener),
    onRunDone: (listener: (payload: RunDonePayload) => void) =>
      subscription(listeners.done, listener),
    onRunError: (listener: (payload: RunErrorPayload) => void) =>
      subscription(listeners.error, listener),
    onRunCancelled: (listener: (payload: { runId: string }) => void) =>
      subscription(listeners.cancelled, listener),
  };

  // Le pont réel porte une quarantaine de fonctions ; le popover en touche
  // neuf. Les autres restent absentes : un appel inattendu doit échouer
  // bruyamment, pas rendre `undefined`.
  window.reqraft = partial as unknown as ReqraftBridge;

  const view = render(
    <TranslationProvider>
      <PopoverApp />
    </TranslationProvider>,
  );
  await screen.findByPlaceholderText(DESKTOP_EN["popover.placeholder"]);

  const diffuser = <T,>(list: ((payload: T) => void)[], payload: T): void => {
    for (const listener of [...list]) listener(payload);
  };

  return {
    bridge: { startReprompt, acceptResult, openSettings },
    push: {
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
    dernierRunId: () => `run-${String(runs)}`,
    view,
  };
}

/** Le champ du prompt de départ, tel que la synthèse vocale le trouve. */
export function champPrompt(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>(EN["popover.promptLabel"]);
}

/** Le champ du résultat. */
export function champResultat(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>(EN["popover.resultLabel"]);
}

/** Une commande, par son libellé. */
export function commande(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(label, "i") });
}

/** L'annonce affichée, quel que soit son ton. */
export function annonce(): HTMLElement | null {
  return document.querySelector(".toast-text");
}

/**
 * Écrit un prompt, lance, et attend le résultat.
 *
 * Les mêmes chemins que le produit — aucun état n'est posé de force. La
 * livraison est retentée jusqu'à ce qu'elle porte : le renderer n'apprend son
 * `runId` que lorsque `reprompt:start` a répondu, et un résultat poussé avant
 * est correctement ignoré par le filtrage du contrat.
 */
export async function arriveAuResultat(
  harness: PopoverHarness,
  prompt: string,
  rewritten: string,
): Promise<void> {
  await harness.user.type(champPrompt(), prompt);
  await harness.user.click(commande(EN["capsule.reformulate"]));
  await waitFor(() => {
    expect(harness.bridge.startReprompt).toHaveBeenCalled();
  });
  await pousserResultat(harness, rewritten);
}

export async function pousserResultat(harness: PopoverHarness, rewritten: string): Promise<void> {
  const result = repromptResult(rewritten);
  await waitFor(() => {
    harness.push.done({ runId: harness.dernierRunId(), result });
    expect(champResultat().value).toBe(rewritten);
  });
}
