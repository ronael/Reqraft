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
  // Contract amendment (WORKLOG lot 4): the popover needs the profile catalog,
  // and both popover and capsule need to open the settings window. §8.1's
  // table predates those surfaces; channels are still defined ONLY here.
  profilesList: "profiles:list",
  // Local profile management (settings → Profils). `profiles:list` stays the
  // lightweight identity feed the popover and the capsule use; these carry the
  // origin, and — for an explicit edit only — a profile's full contents.
  profilesCatalog: "profiles:catalog",
  profileRead: "profiles:read",
  profileSave: "profiles:save",
  profileDuplicate: "profiles:duplicate",
  profileDelete: "profiles:delete",
  profileExport: "profiles:export",
  windowOpenSettings: "window:open-settings",
  shortcutsState: "shortcuts:state",
  // Desktop onboarding: someone who installed only the application must be
  // able to configure it without the CLI. `onboarding:state` reports whether
  // a usable configuration exists and offers the choices; `credential:save`
  // hands a secret to the main process, which is the only side allowed to
  // hold one; `onboarding:complete` persists the result through the shared
  // configuration domain.
  onboardingState: "onboarding:state",
  onboardingComplete: "onboarding:complete",
  credentialSave: "credential:save",
  // Managing providers after setup. Configuring one only during onboarding
  // would mean a key can never be replaced and an endpoint never corrected
  // without the CLI — which is what the desktop is meant to stop requiring.
  credentialDelete: "credential:delete",
  providerSave: "providers:save",
  providerDelete: "providers:delete",
  // Main → renderer, pushed (webContents.send).
  runDelta: "run:delta",
  runDone: "run:done",
  runError: "run:error",
  runCancelled: "run:cancelled",
  // Sent by the main each time the capsule is (re)shown: the window persists
  // between triggers, so the renderer must reset its session on this event.
  capsuleOpened: "capsule:opened",
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
  IPC_CHANNELS.profilesList,
  IPC_CHANNELS.profilesCatalog,
  IPC_CHANNELS.profileRead,
  IPC_CHANNELS.profileSave,
  IPC_CHANNELS.profileDuplicate,
  IPC_CHANNELS.profileDelete,
  IPC_CHANNELS.profileExport,
  IPC_CHANNELS.windowOpenSettings,
  IPC_CHANNELS.shortcutsState,
  IPC_CHANNELS.onboardingState,
  IPC_CHANNELS.onboardingComplete,
  IPC_CHANNELS.credentialSave,
  IPC_CHANNELS.credentialDelete,
  IPC_CHANNELS.providerSave,
  IPC_CHANNELS.providerDelete,
] as const;

/** Channels the main process pushes to the renderer. */
export const PUSH_CHANNELS = [
  IPC_CHANNELS.runDelta,
  IPC_CHANNELS.runDone,
  IPC_CHANNELS.runError,
  IPC_CHANNELS.runCancelled,
  IPC_CHANNELS.capsuleOpened,
] as const;
