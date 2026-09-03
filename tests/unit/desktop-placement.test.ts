import { describe, expect, it } from "vitest";
import {
  placeCapsule,
  placeCapsuleOnSide,
  placePopover,
  resolveCapsuleSide,
  type CapsuleAnchor,
  type WorkArea,
} from "@/apps/desktop/main/windows/placement.js";
import {
  CAPSULE_MAX_HEIGHT,
  CAPSULE_MIN_HEIGHT,
  CAPSULE_WIDTH,
} from "@/apps/desktop/shared/capsule-geometry.js";

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

/**
 * Le côté d'ouverture, et la fenêtre qui grandit sans dériver.
 *
 * Une capsule à hauteur adaptative change de taille plusieurs fois par session.
 * Deux défauts guettent, et ce sont les deux que ces cas tiennent : basculer
 * d'un côté à l'autre du curseur quand le résultat s'allonge, et accumuler du
 * décalage parce que la position suivante se calcule à partir de la précédente.
 */
describe("resolveCapsuleSide : le côté, arrêté une fois pour la session", () => {
  it("ouvre sous le curseur quand la hauteur MAXIMALE y tient", () => {
    expect(resolveCapsuleSide({ kind: "cursor", point: { x: 700, y: 200 } }, 440, WORK_AREA)).toBe(
      "below",
    );
  });

  it("bascule au-dessus quand elle n'y tient pas, avant même de grandir", () => {
    // À cette hauteur de curseur, 380 tient encore en dessous mais 440 non.
    // Décider avec la hauteur du moment ferait sauter la capsule au-dessus du
    // curseur au premier résultat long.
    const anchor: CapsuleAnchor = { kind: "cursor", point: { x: 700, y: 560 } };
    expect(resolveCapsuleSide(anchor, 380, WORK_AREA)).toBe("below");
    expect(resolveCapsuleSide(anchor, 440, WORK_AREA)).toBe("above");
  });

  it("garde le côté le plus large quand aucun des deux ne suffit", () => {
    const petiteZone: WorkArea = { x: 0, y: 0, width: 1280, height: 400 };
    expect(resolveCapsuleSide({ kind: "cursor", point: { x: 640, y: 40 } }, 440, petiteZone)).toBe(
      "below",
    );
    expect(resolveCapsuleSide({ kind: "cursor", point: { x: 640, y: 360 } }, 440, petiteZone)).toBe(
      "above",
    );
  });

  it("ne s'applique pas à une capsule centrée : elle n'a pas de curseur", () => {
    expect(resolveCapsuleSide({ kind: "centered" }, 440, WORK_AREA)).toBe("centered");
  });
});

describe("placeCapsuleOnSide : grandir sans dériver", () => {
  const CURSOR: CapsuleAnchor = { kind: "cursor", point: { x: 700, y: 200 } };

  function at(anchor: CapsuleAnchor, side: "below" | "above" | "centered", height: number) {
    return placeCapsuleOnSide(anchor, side, { width: CAPSULE_WIDTH, height }, WORK_AREA);
  }

  it("garde le bord HAUT immobile du côté « below »", () => {
    const petite = at(CURSOR, "below", CAPSULE_MIN_HEIGHT);
    const grande = at(CURSOR, "below", CAPSULE_MAX_HEIGHT);

    expect(petite.y).toBe(grande.y);
    expect(petite.x).toBe(grande.x);
  });

  it("garde le bord BAS immobile du côté « above »", () => {
    const haut: CapsuleAnchor = { kind: "cursor", point: { x: 700, y: 800 } };
    const petite = at(haut, "above", CAPSULE_MIN_HEIGHT);
    const grande = at(haut, "above", CAPSULE_MAX_HEIGHT);

    expect(petite.y + CAPSULE_MIN_HEIGHT).toBe(grande.y + CAPSULE_MAX_HEIGHT);
  });

  it("rend le même point pour la même hauteur, quel que soit le chemin", () => {
    // Le cas qui compte : grandir puis rétrécir doit ramener exactement où
    // l'on était. Une position calculée depuis la précédente accumulerait le
    // calage et ferait remonter la fenêtre à chaque aller-retour.
    const sequence = [172, 440, 228, 440, 172, 172];
    const points = sequence.map((height) => at(CURSOR, "below", height));

    expect(points[0]).toEqual(points.at(-1));
    expect(points[1]).toEqual(points[3]);
  });

  it("reste dans la zone de travail à chaque hauteur, près de chaque bord", () => {
    const coins: CapsuleAnchor[] = [
      { kind: "cursor", point: { x: WORK_AREA.x + 2, y: WORK_AREA.y + 2 } },
      { kind: "cursor", point: { x: WORK_AREA.x + WORK_AREA.width - 2, y: WORK_AREA.y + 2 } },
      {
        kind: "cursor",
        point: { x: WORK_AREA.x + 2, y: WORK_AREA.y + WORK_AREA.height - 2 },
      },
      {
        kind: "cursor",
        point: {
          x: WORK_AREA.x + WORK_AREA.width - 2,
          y: WORK_AREA.y + WORK_AREA.height - 2,
        },
      },
      { kind: "centered" },
    ];
    for (const anchor of coins) {
      const side = resolveCapsuleSide(anchor, CAPSULE_MAX_HEIGHT, WORK_AREA);
      for (const height of [CAPSULE_MIN_HEIGHT, 228, CAPSULE_MAX_HEIGHT]) {
        const point = placeCapsuleOnSide(anchor, side, { width: CAPSULE_WIDTH, height }, WORK_AREA);
        expect(point.x, JSON.stringify({ anchor, height })).toBeGreaterThanOrEqual(WORK_AREA.x);
        expect(point.x + CAPSULE_WIDTH).toBeLessThanOrEqual(WORK_AREA.x + WORK_AREA.width);
        expect(point.y).toBeGreaterThanOrEqual(WORK_AREA.y);
        expect(point.y + height).toBeLessThanOrEqual(WORK_AREA.y + WORK_AREA.height);
      }
    }
  });

  it("tient sur un écran plus court que la capsule sans produire de NaN", () => {
    const minuscule: WorkArea = { x: 0, y: 0, width: 800, height: 220 };
    const anchor: CapsuleAnchor = { kind: "cursor", point: { x: 400, y: 120 } };
    const side = resolveCapsuleSide(anchor, CAPSULE_MAX_HEIGHT, minuscule);
    const point = placeCapsuleOnSide(
      anchor,
      side,
      { width: CAPSULE_WIDTH, height: CAPSULE_MAX_HEIGHT },
      minuscule,
    );

    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(point.y).toBeGreaterThanOrEqual(minuscule.y);
  });
});
