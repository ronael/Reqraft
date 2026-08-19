import type { CliRendererConfig } from "@opentui/core";

export function createOpenTuiRendererOptions(): CliRendererConfig {
  return {
    // Ctrl+C is routed by the application (cancel while generating, exit
    // otherwise), never by the renderer itself. Letting OpenTUI also exit on
    // the key would make a mid-run cancel impossible and duplicate the path.
    exitOnCtrlC: false,
    useMouse: true,
  };
}
