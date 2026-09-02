import { describe, expect, it } from "vitest";
import {
  describeUpdateState,
  updateStateTone,
} from "@/apps/desktop/renderer/settings/UpdatesTab.js";
import type { DesktopUpdateState } from "@/apps/desktop/shared/ipc-contract.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

const t = createDesktopTranslator("fr");

function state(status: DesktopUpdateState["status"], latestVersion?: string): DesktopUpdateState {
  return { status, currentVersion: "0.5.0", ...(latestVersion ? { latestVersion } : {}) };
}

describe("describeUpdateState", () => {
  it("parle avant toute vérification", () => {
    expect(describeUpdateState(null, t)).toBe(t("settings.updates.notChecked"));
    expect(describeUpdateState(state("idle"), t)).toBe(t("settings.updates.notChecked"));
  });

  it("nomme la version disponible", () => {
    expect(describeUpdateState(state("available", "0.6.0"), t)).toContain("0.6.0");
  });

  it("ne laisse pas un gabarit à l'écran quand la version manque", () => {
    expect(describeUpdateState(state("available"), t)).not.toContain("{");
  });

  it("dit la phrase complète en cas d'échec, pas son abrégé", () => {
    expect(describeUpdateState(state("error"), t)).toBe(t("settings.updates.error"));
  });
});

describe("updateStateTone", () => {
  it("réserve le vert à ce qui ne demande rien", () => {
    expect(updateStateTone(state("up-to-date"))).toBe("success");
    expect(updateStateTone(state("available", "0.6.0"))).toBe("info");
  });

  it("fait tourner l'icône pendant la vérification seulement", () => {
    expect(updateStateTone(state("checking"))).toBe("pending");
    expect(updateStateTone(state("idle"))).toBe("info");
    expect(updateStateTone(null)).toBe("info");
  });

  it("garde le ton d'erreur pour l'appel qui n'a pas abouti", () => {
    expect(updateStateTone(state("error"))).toBe("error");
  });
});
