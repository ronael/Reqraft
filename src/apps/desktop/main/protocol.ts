import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

/**
 * Custom `rq://` protocol serving the renderer.
 *
 * Vite emits `<script type="module">`, and Chromium refuses module scripts
 * over `file://` (CORS) — the window opens but stays blank. Serving the
 * renderer over a privileged scheme fixes modules, preload resolution and
 * the CSP `'self'` origin in one move.
 */

export const RQ_SCHEME = "rq";
export const RQ_RENDERER_HOST = "renderer";

/** Must run BEFORE `app.whenReady()` — scheme privileges are startup-only. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RQ_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function rqRendererUrl(
  surface?: "popover" | "settings" | "onboarding",
  params: Readonly<Record<string, string>> = {},
): string {
  const base = `${RQ_SCHEME}://${RQ_RENDERER_HOST}/index.html`;
  const search = new URLSearchParams(params);
  if (surface !== undefined) {
    search.set("surface", surface);
  }
  const query = search.toString();
  return query === "" ? base : `${base}?${query}`;
}

/**
 * Maps an `rq://renderer/<path>` URL to a file inside `rendererDir`, refusing
 * anything that escapes it. Pure and tested without Electron.
 */
export function mapRqUrlToFile(url: string, rendererDir: string): string | null {
  const parsed = URL.parse(url);
  if (parsed?.protocol !== `${RQ_SCHEME}:` || parsed.host !== RQ_RENDERER_HOST) {
    return null;
  }
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  const resolved = path.resolve(rendererDir, relative === "" ? "index.html" : relative);
  return resolved.startsWith(rendererDir + path.sep) ? resolved : null;
}

/** Serves the renderer directory over `rq://`. Call once the app is ready. */
export function registerRendererProtocol(rendererDir: string): void {
  protocol.handle(RQ_SCHEME, (request) => {
    const file = mapRqUrlToFile(request.url, rendererDir);
    if (file === null) {
      return new Response(null, { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}
