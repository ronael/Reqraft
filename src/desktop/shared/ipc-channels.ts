/**
 * IPC channel names — the single point of definition (DESKTOP.md §8.1).
 *
 * Zero-import module on purpose: the sandboxed preload bundles it, so it must
 * stay free of any runtime dependency. Payload types and validation schemas
 * live in `ipc-contract.ts`; handlers live in `main/ipc.ts`. No channel is
 * declared anywhere else.
 */
export const IPC_CHANNELS = {
  // Renderer → main, with response (invoke/handle).
  repromptStart: "reprompt:start",
  repromptCancel: "reprompt:cancel",
  captureSelection: "capture:selection",
  resultAccept: "result:accept",
  configRead: "config:read",
  configWrite: "config:write",
  providersStatus: "providers:status",
  doctorRun: "doctor:run",
  permissionsState: "permissions:state",
  permissionsRequest: "permissions:request",
  // Main → renderer, pushed (webContents.send).
  runDelta: "run:delta",
  runDone: "run:done",
  runError: "run:error",
  runCancelled: "run:cancelled",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Channels the renderer invokes and the main process answers. */
export const REQUEST_CHANNELS = [
  IPC_CHANNELS.repromptStart,
  IPC_CHANNELS.repromptCancel,
  IPC_CHANNELS.captureSelection,
  IPC_CHANNELS.resultAccept,
  IPC_CHANNELS.configRead,
  IPC_CHANNELS.configWrite,
  IPC_CHANNELS.providersStatus,
  IPC_CHANNELS.doctorRun,
  IPC_CHANNELS.permissionsState,
  IPC_CHANNELS.permissionsRequest,
] as const;

/** Channels the main process pushes to the renderer. */
export const PUSH_CHANNELS = [
  IPC_CHANNELS.runDelta,
  IPC_CHANNELS.runDone,
  IPC_CHANNELS.runError,
  IPC_CHANNELS.runCancelled,
] as const;
