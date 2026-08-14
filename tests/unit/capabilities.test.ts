import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "../../src/capabilities/registry.js";
import { listCliCapabilities, listUnregisteredCliOptions } from "../../src/capabilities/cli.js";
import { listTuiCapabilities } from "../../src/capabilities/tui.js";
import { createCliProgram } from "../../src/cli-program.js";
import { createTranslator } from "../../src/i18n/translate.js";

// The real Commander declaration, built exactly like the shipped CLI.
const program = createCliProgram(createTranslator("fr"), "fr");

describe("capability registry", () => {
  it("exposes every registered capability on each surface it declares", () => {
    const cli = listCliCapabilities(program);
    const tui = listTuiCapabilities();

    for (const capability of CAPABILITIES) {
      // The desktop surface is not implemented yet, only cli and tui are checked.
      if (capability.surfaces.includes("cli")) {
        expect(cli, `cli must expose ${capability.id}`).toContain(capability.id);
      }
      if (capability.surfaces.includes("tui")) {
        expect(tui, `tui must expose ${capability.id}`).toContain(capability.id);
      }
    }
  });

  it("rejects capabilities exposed by a surface but missing from the registry", () => {
    for (const id of listCliCapabilities(program)) {
      expect(
        CAPABILITIES.some(
          (capability) => capability.id === id && capability.surfaces.includes("cli"),
        ),
        `cli exposes ${id} without a registry entry`,
      ).toBe(true);
    }
    for (const id of listTuiCapabilities()) {
      expect(
        CAPABILITIES.some(
          (capability) => capability.id === id && capability.surfaces.includes("tui"),
        ),
        `tui exposes ${id} without a registry entry`,
      ).toBe(true);
    }
    // Symmetric CLI check on real options: any Commander option that is
    // neither a registered capability nor a known non-capability option drifted.
    expect(listUnregisteredCliOptions(program)).toEqual([]);
  });
});
