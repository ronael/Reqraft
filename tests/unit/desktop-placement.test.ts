import { describe, expect, it } from "vitest";
import {
  placeCapsule,
  placePopover,
  type WorkArea,
} from "@/apps/desktop/main/windows/placement.js";

const CAPSULE = { width: 560, height: 480 };
const WORK_AREA: WorkArea = { x: 0, y: 25, width: 1512, height: 955 };

describe("placeCapsule (DESKTOP.md §3, §4.3)", () => {
  it("ancre au curseur : centré horizontalement, ouvert en dessous", () => {
    const position = placeCapsule(
      { kind: "cursor", point: { x: 756, y: 300 } },
      CAPSULE,
      WORK_AREA,
    );
    expect(position).toEqual({ x: 476, y: 308 });
  });

  it("sans sélection : centrée dans la zone de travail", () => {
    const position = placeCapsule({ kind: "centered" }, CAPSULE, WORK_AREA);
    expect(position).toEqual({ x: 476, y: 263 });
  });

  it("curseur près du bord droit : la capsule reste dans l'écran", () => {
    const position = placeCapsule(
      { kind: "cursor", point: { x: 1500, y: 300 } },
      CAPSULE,
      WORK_AREA,
    );
    expect(position.x + CAPSULE.width).toBeLessThanOrEqual(WORK_AREA.width - 12);
  });

  it("curseur près du bord gauche : la capsule reste dans l'écran", () => {
    const position = placeCapsule({ kind: "cursor", point: { x: 4, y: 300 } }, CAPSULE, WORK_AREA);
    expect(position.x).toBe(12);
  });

  it("pas de place en dessous : la capsule bascule au-dessus du curseur", () => {
    const position = placeCapsule(
      { kind: "cursor", point: { x: 756, y: 900 } },
      CAPSULE,
      WORK_AREA,
    );
    // above = 900 - 8 - 480 = 412
    expect(position.y).toBe(412);
  });

  it("zone de travail avec offset (écran secondaire) : respectée", () => {
    const area: WorkArea = { x: 1512, y: 25, width: 1920, height: 1055 };
    const position = placeCapsule({ kind: "centered" }, CAPSULE, area);
    expect(position.x).toBe(1512 + 960 - 280);
    expect(position.y).toBe(25 + Math.round(1055 / 2 - 240));
  });

  it("capsule plus grande que l'écran : épinglée à l'origine, jamais NaN", () => {
    const position = placeCapsule(
      { kind: "cursor", point: { x: 100, y: 100 } },
      { width: 5000, height: 5000 },
      WORK_AREA,
    );
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  });
});

describe("placePopover (lot 4)", () => {
  const POPOVER = { width: 320, height: 260 };

  it("s'ouvre sous l'icône de la menu bar, centrée sur elle", () => {
    const position = placePopover({ x: 1300, y: 0, width: 24, height: 22 }, POPOVER, WORK_AREA);
    // centrée sur 1312 → 1312 - 160 = 1152 ; sous l'icône → 22 + 8 = 30,
    // clampée au bord haut de la zone de travail → 25 + 12 = 37
    expect(position).toEqual({ x: 1152, y: 37 });
  });

  it("icône au bord droit : le popover reste dans l'écran", () => {
    const position = placePopover({ x: 1500, y: 0, width: 12, height: 22 }, POPOVER, WORK_AREA);
    expect(position.x + POPOVER.width).toBeLessThanOrEqual(WORK_AREA.width - 12);
  });
});
