import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  CapsuleOpenedPayload,
  ReqraftBridge,
  RunCancelledPayload,
  RunDeltaPayload,
  RunDonePayload,
  RunErrorPayload,
  Unsubscribe,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Preload: the only bridge between the untrusted renderer and the main
 * process. It exposes named functions — one per contract channel — and never
 * `ipcRenderer` itself nor a generic `invoke` (DESKTOP.md §2.3). Built as a
 * single CJS file so it runs with `sandbox: true`.
 */

function subscribe(channel: string, listener: (payload: unknown) => void): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const bridge: ReqraftBridge = {
  startReprompt: (request) => ipcRenderer.invoke(IPC_CHANNELS.repromptStart, request),
  cancelReprompt: (runId) => ipcRenderer.invoke(IPC_CHANNELS.repromptCancel, { runId }),
  captureSelection: () => ipcRenderer.invoke(IPC_CHANNELS.captureSelection),
  // Le texte n'accompagne l'acceptation que s'il a été repris à la main : la
  // clé reste absente sinon, et le processus principal applique le résultat
  // qu'il a lui-même produit.
  acceptResult: (runId, mode, text) =>
    ipcRenderer.invoke(IPC_CHANNELS.resultAccept, {
      runId,
      mode,
      ...(text === undefined ? {} : { text }),
    }),
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  writeConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.configWrite, patch),
  providersStatus: () => ipcRenderer.invoke(IPC_CHANNELS.providersStatus),
  runDoctor: () => ipcRenderer.invoke(IPC_CHANNELS.doctorRun),
  // Aucun argument, par contrat : le main reconstruit le rapport et le formate
  // lui-même. Rien de ce que le renderer contient ne peut atteindre le
  // presse-papiers par ce chemin.
  copyDoctorReport: () => ipcRenderer.invoke(IPC_CHANNELS.doctorCopy),
  permissionsState: () => ipcRenderer.invoke(IPC_CHANNELS.permissionsState),
  requestPermissions: () => ipcRenderer.invoke(IPC_CHANNELS.permissionsRequest),
  updatesState: () => ipcRenderer.invoke(IPC_CHANNELS.updatesState),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck),
  openUpdateDownload: () => ipcRenderer.invoke(IPC_CHANNELS.updatesOpenDownload),
  listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.profilesList),
  profileCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.profilesCatalog),
  readProfile: (id) => ipcRenderer.invoke(IPC_CHANNELS.profileRead, { id }),
  saveProfile: (request) => ipcRenderer.invoke(IPC_CHANNELS.profileSave, request),
  duplicateProfile: (request) => ipcRenderer.invoke(IPC_CHANNELS.profileDuplicate, request),
  deleteProfile: (id) => ipcRenderer.invoke(IPC_CHANNELS.profileDelete, { id }),
  exportProfile: (id) => ipcRenderer.invoke(IPC_CHANNELS.profileExport, { id }),
  readLocale: (locale) =>
    ipcRenderer.invoke(IPC_CHANNELS.localeRead, locale === undefined ? undefined : { locale }),
  capsulePending: () => ipcRenderer.invoke(IPC_CHANNELS.capsulePending),
  // Un nombre, rien d'autre : la fenêtre reste hors de portée du renderer.
  resizeCapsule: (height) => ipcRenderer.invoke(IPC_CHANNELS.capsuleResize, { height }),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.windowOpenSettings),
  openWelcomeTour: () => ipcRenderer.invoke(IPC_CHANNELS.windowOpenWelcomeTour),
  shortcutsState: () => ipcRenderer.invoke(IPC_CHANNELS.shortcutsState),
  onboardingState: () => ipcRenderer.invoke(IPC_CHANNELS.onboardingState),
  completeWelcomeTour: () => ipcRenderer.invoke(IPC_CHANNELS.onboardingTourComplete),
  // The one call that carries a secret. It goes one way: the main process
  // stores it and answers with statuses, never with the value.
  saveCredential: (request) => ipcRenderer.invoke(IPC_CHANNELS.credentialSave, request),
  deleteCredential: (request) => ipcRenderer.invoke(IPC_CHANNELS.credentialDelete, request),
  saveProvider: (request) => ipcRenderer.invoke(IPC_CHANNELS.providerSave, request),
  deleteProvider: (id) => ipcRenderer.invoke(IPC_CHANNELS.providerDelete, { id }),
  testProvider: (request) => ipcRenderer.invoke(IPC_CHANNELS.providerTest, request),
  // Ne porte qu'une identité de fournisseur : la clé, l'URL de base et les
  // en-têtes restent du côté qui les détient déjà.
  listModels: (request) => ipcRenderer.invoke(IPC_CHANNELS.modelsList, request),
  completeOnboarding: (request) => ipcRenderer.invoke(IPC_CHANNELS.onboardingComplete, request),
  onRunDelta: (listener) =>
    subscribe(IPC_CHANNELS.runDelta, (payload) => {
      listener(payload as RunDeltaPayload);
    }),
  onRunDone: (listener) =>
    subscribe(IPC_CHANNELS.runDone, (payload) => {
      listener(payload as RunDonePayload);
    }),
  onRunError: (listener) =>
    subscribe(IPC_CHANNELS.runError, (payload) => {
      listener(payload as RunErrorPayload);
    }),
  onRunCancelled: (listener) =>
    subscribe(IPC_CHANNELS.runCancelled, (payload) => {
      listener(payload as RunCancelledPayload);
    }),
  onCapsuleOpened: (listener) =>
    subscribe(IPC_CHANNELS.capsuleOpened, (payload) => {
      listener(payload as CapsuleOpenedPayload);
    }),
};

contextBridge.exposeInMainWorld("reqraft", bridge);
