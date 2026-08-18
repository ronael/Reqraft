import { CAPSULE_STATES } from "@/desktop/shared/capsule-machine.js";
import { IPC_CHANNELS } from "@/desktop/shared/ipc-channels.js";
import { RESULT_ACCEPT_MODES } from "@/desktop/shared/ipc-contract.js";

/**
 * Desktop capability inventory — derived from the REAL desktop declarations
 * (IPC contract, capsule state machine), never from a hand-copied list
 * (CAPABILITIES.md §5). The drift tests in `tests/unit/capabilities.test.ts`
 * compare this inventory against the registry in both directions.
 *
 * What cannot be derived structurally is listed in STATIC_CAPABILITIES with
 * its justification, mirroring the `interrupt` precedent of `tui.ts`.
 */
export function listDesktopCapabilities(): string[] {
  const ids = new Set<string>();

  // reprompt:start exists and its request carries the selector fields.
  if (IPC_CHANNELS.repromptStart.length > 0) {
    ids.add("reformulate");
    ids.add("select-profile");
    ids.add("select-level");
    ids.add("select-provider");
    ids.add("select-model");
  }

  // result:accept modes are the accept/copy capabilities.
  for (const mode of RESULT_ACCEPT_MODES) {
    if (mode === "copy") {
      ids.add("copy-result");
    }
    if (mode === "replace") {
      ids.add("replace-in-place");
    }
  }

  // reprompt:cancel is the interrupt capability.
  if (IPC_CHANNELS.repromptCancel.length > 0) {
    ids.add("interrupt");
  }

  // The comparaison state of the §8.2 machine is the diff view.
  if (CAPSULE_STATES.includes("comparaison")) {
    ids.add("show-diff");
  }

  // run:done delivers the result to every surface (capsule, popover).
  if (IPC_CHANNELS.runDone.length > 0) {
    ids.add("show-result");
  }

  for (const id of STATIC_CAPABILITIES) {
    ids.add(id);
  }
  return [...ids];
}

/**
 * Capabilities the desktop exposes without a structural anchor:
 * - redact-secrets: `reprompt-service.ts` runs `detectSecrets()` on every
 *   captured text before anything leaves the machine (DESKTOP.md §9) ;
 * - show-stats: the capsule verdict line displays model, level and latency
 *   from the result payload.
 */
const STATIC_CAPABILITIES = ["redact-secrets", "show-stats"] as const;
