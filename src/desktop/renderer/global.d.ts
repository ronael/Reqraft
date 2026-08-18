import type { ReqraftBridge } from "@/desktop/shared/ipc-contract.js";

declare global {
  interface Window {
    /** The only bridge to the main process, exposed by the preload. */
    reqraft: ReqraftBridge;
  }
}

export {};
