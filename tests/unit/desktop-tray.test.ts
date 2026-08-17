import { describe, expect, it } from "vitest";
import { trayIconPng, trayTooltip, type TrayState } from "../../src/desktop/main/tray-icon.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const STATES: TrayState[] = ["repos", "busy", "error"];

describe("tray icons (lot 4)", () => {
  it("les trois états ont un PNG valide, tous distincts", () => {
    const icons = STATES.map((state) => trayIconPng(state));
    for (const icon of icons) {
      expect(icon.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true);
      expect(icon.length).toBeGreaterThan(50);
    }
    expect(new Set(icons.map((icon) => icon.toString("base64"))).size).toBe(3);
  });

  it("chaque état a une infobulle en français", () => {
    for (const state of STATES) {
      expect(trayTooltip(state).length).toBeGreaterThan(0);
    }
  });
});
