/**
 * The sentence a rejected `window.reqraft` call carries, without Electron's frame.
 *
 * `ipcRenderer.invoke` rejects with "Error invoking remote method '<channel>':
 * <error.toString()>". The main process words every failure before it leaves
 * (`main/ipc.ts`), so what follows the frame is "Error: <sentence>", and the
 * sentence is all a window has to show. One helper for every window: each one
 * stripping the frame its own way is how the capsule came to show it whole.
 */
export function ipcFailureMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "");
}
