import type { SystemPermissionPane } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * The macOS permission behind a failed native call, or null for any other
 * cause.
 *
 * osascript reports a missing Accessibility grant as error 1002 ("not allowed
 * to send keystrokes"), and a refused Automation of System Events as -1743
 * ("Not authorized to send Apple events"). They are two settings in two
 * panes: sending someone to the wrong one leads nowhere.
 */
export function permissionOf(error: unknown): SystemPermissionPane | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("1002") || message.includes("not allowed to send keystrokes")) {
    return "accessibility";
  }
  if (message.includes("1743") || message.includes("Apple event")) {
    return "automation";
  }
  return null;
}

/**
 * The field an outcome carries so the capsule can offer the right pane:
 * present only when a permission is the cause, never guessed otherwise.
 */
export function permissionField(error: unknown): { permission?: SystemPermissionPane } {
  const permission = permissionOf(error);
  return permission === null ? {} : { permission };
}
