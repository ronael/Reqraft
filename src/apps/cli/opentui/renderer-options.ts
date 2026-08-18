import type { CliRendererConfig } from "@opentui/core";

export function createOpenTuiRendererOptions(): CliRendererConfig {
  return {
    exitOnCtrlC: true,
    useMouse: true,
  };
}
