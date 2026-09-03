import { describe, expect, it } from "vitest";
import {
  suspendedTrayTooltip,
  trayIconPng,
  trayTooltip,
  type TrayState,
} from "@/apps/desktop/main/tray-icon.js";
import { createShortcutSuspensionMenuItem } from "@/apps/desktop/main/tray-menu.js";

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

  it("la suspension remplace l'infobulle opérationnelle", () => {
    expect(suspendedTrayTooltip()).toBe("Reqraft — global shortcuts suspended");
  });
});

describe("menu tray", () => {
  it("reflète la suspension et transmet l'état coché par Electron", () => {
    const changes: boolean[] = [];
    const item = createShortcutSuspensionMenuItem(true, (suspended) => {
      changes.push(suspended);
    });

    expect(item).toMatchObject({
      label: "Suspend global shortcuts",
      type: "checkbox",
      checked: true,
    });
    item.click({ checked: false });
    expect(changes).toEqual([false]);
  });
});
