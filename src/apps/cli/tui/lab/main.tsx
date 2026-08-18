import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpenTuiRendererOptions } from "@/apps/cli/opentui/renderer-options.js";
import { Gallery } from "./Gallery.js";

/**
 * Entry point for `pnpm tui:lab`.
 *
 * Boots the same renderer the real TUI uses, with none of the application
 * wiring: no config load, no provider, no generation. The point is a tight
 * loop between editing tokens and seeing the result.
 */
const renderer = await createCliRenderer(createOpenTuiRendererOptions());
createRoot(renderer).render(<Gallery />);
