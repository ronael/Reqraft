import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type {
  ReqraftBridge,
  RunCancelledPayload,
  RunDeltaPayload,
  RunDonePayload,
  RunErrorPayload,
  Unsubscribe,
} from "../shared/ipc-contract.js";

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
  acceptResult: (runId, mode) => ipcRenderer.invoke(IPC_CHANNELS.resultAccept, { runId, mode }),
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  writeConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.configWrite, patch),
  providersStatus: () => ipcRenderer.invoke(IPC_CHANNELS.providersStatus),
  runDoctor: () => ipcRenderer.invoke(IPC_CHANNELS.doctorRun),
  permissionsState: () => ipcRenderer.invoke(IPC_CHANNELS.permissionsState),
  requestPermissions: () => ipcRenderer.invoke(IPC_CHANNELS.permissionsRequest),
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
};

contextBridge.exposeInMainWorld("reqraft", bridge);
