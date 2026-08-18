import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@/capabilities/registry.js";
import { listCliCapabilities, listUnregisteredCliOptions } from "@/capabilities/cli.js";
import { listDesktopCapabilities } from "@/capabilities/desktop.js";
import { listTuiCapabilities } from "@/capabilities/tui.js";
import { createCliProgram } from "@/cli-program.js";
import { createTranslator } from "@/i18n/translate.js";

// The real Commander declaration, built exactly like the shipped CLI.
const program = createCliProgram(createTranslator("fr"), "fr");

describe("capability registry", () => {
  it("exposes every registered capability on each surface it declares", () => {
    const cli = listCliCapabilities(program);
    const tui = listTuiCapabilities();
    const desktop = listDesktopCapabilities();

    for (const capability of CAPABILITIES) {
      if (capability.surfaces.includes("cli")) {
        expect(cli, `cli must expose ${capability.id}`).toContain(capability.id);
      }
      if (capability.surfaces.includes("tui")) {
        expect(tui, `tui must expose ${capability.id}`).toContain(capability.id);
      }
      if (capability.surfaces.includes("desktop")) {
        expect(desktop, `desktop must expose ${capability.id}`).toContain(capability.id);
      }
    }
  });

  it("rejects capabilities exposed by a surface but missing from the registry", () => {
    const surfaces = {
      cli: listCliCapabilities(program),
      tui: listTuiCapabilities(),
      desktop: listDesktopCapabilities(),
    } as const;
    for (const [surface, ids] of Object.entries(surfaces)) {
      for (const id of ids) {
        expect(
          CAPABILITIES.some(
            (capability) =>
              capability.id === id &&
              capability.surfaces.includes(surface as "cli" | "tui" | "desktop"),
          ),
          `${surface} exposes ${id} without a registry entry`,
        ).toBe(true);
      }
    }
    // Symmetric CLI check on real options: any Commander option that is
    // neither a registered capability nor a known non-capability option drifted.
    expect(listUnregisteredCliOptions(program)).toEqual([]);
  });
});
