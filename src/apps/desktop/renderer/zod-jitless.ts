import { z } from "zod";

/**
 * Zod without its JIT compiler, set before any schema is built.
 *
 * Zod 4 compiles object parsers with `new Function`, and probes for it as soon
 * as the first object schema is built — the IPC contract builds several at
 * import. The CSP of `index.html` refuses eval: the probe fails silently but
 * reports a CSP violation every time a window opens. The renderer never parses
 * anything (the main process validates the IPC), so the compiler buys it
 * nothing. `main.tsx` imports this module first, before the contract loads.
 */
z.config({ jitless: true });
