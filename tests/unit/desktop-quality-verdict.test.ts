import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { describeQualityFinding } from "@/apps/desktop/renderer/shared/quality.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";
import type { RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Le verdict de la capsule ne doit jamais dire « aucune invention détectée »
 * devant une invention.
 *
 * C'est la seule ligne que quelqu'un lit avant de remplacer son texte : un
 * verdict rassurant à tort est pire que pas de verdict du tout.
 */

const t = createDesktopTranslator("fr");
type Signals = RepromptResult["quality"]["signals"];

describe("describeQualityFinding", () => {
  it("nomme les chemins ajoutés", () => {
    const signals: Signals = [
      { code: "invented_paths", severity: "warning", params: { paths: ["src/auth/session.ts"] } },
    ];

    expect(describeQualityFinding(signals, t)?.detail).toContain("src/auth/session.ts");
  });

  it("nomme les commandes ajoutées", () => {
    const signals: Signals = [
      { code: "invented_commands", severity: "warning", params: { commands: ["rm -rf"] } },
    ];

    expect(describeQualityFinding(signals, t)?.detail).toContain("rm -rf");
  });

  it("ne dit rien quand rien n'a été inventé", () => {
    const signals: Signals = [{ code: "disproportionate_expansion", severity: "warning" }];

    expect(describeQualityFinding(signals, t)).toBeNull();
    expect(describeQualityFinding([], t)).toBeNull();
  });

  it("ne transforme pas un signal informatif du mode permissif en avertissement", () => {
    const signals: Signals = [
      { code: "invented_commands", severity: "info", params: { commands: ["git push"] } },
      { code: "structural_inflation", severity: "info" },
    ];

    expect(describeQualityFinding(signals, t)).toBeNull();
  });

  it("annonce les chemins avant les commandes, quel que soit l'ordre des signaux", () => {
    // Le pied tient une ligne : on montre la trouvaille la plus utile, pas la
    // première venue. L'ordre du tableau suit celui où les détections tournent,
    // qui n'a rien à voir avec ce qui aide le plus.
    const signals: Signals = [
      { code: "invented_commands", severity: "warning", params: { commands: ["git push"] } },
      { code: "invented_paths", severity: "warning", params: { paths: ["a/b/c.ts"] } },
    ];

    expect(describeQualityFinding(signals, t)?.detail).toContain("a/b/c.ts");
  });
});

describe("le verdict de la capsule s'en sert", () => {
  it("préfère l'invention au « aucune invention détectée »", async () => {
    // Le test ci-dessus prouve la fonction ; celui-ci prouve le branchement.
    // Sans lui, la capsule pourrait garder son message rassurant et aucun test
    // pur ne bougerait.
    const source = await readFile("src/apps/desktop/renderer/capsule/App.tsx", "utf8");

    expect(source).toContain("if (finding !== null) return finding.detail");
  });
});

describe("la restructuration compte aussi", () => {
  it("le dit, plutôt que d'annoncer « aucune invention »", () => {
    // Rien n'a été inventé au sens strict, mais la demande a changé de nature :
    // un verdict rassurant serait trompeur de la même façon.
    const signals: Signals = [{ code: "structural_inflation", severity: "warning" }];

    expect(describeQualityFinding(signals, t)).toEqual({
      label: t("capsule.restructured"),
      detail: t("capsule.structuralInflation"),
    });
  });

  it("montre d'abord ce qui se vérifie", () => {
    const signals: Signals = [
      { code: "structural_inflation", severity: "warning" },
      { code: "invented_paths", severity: "warning", params: { paths: ["a/b/c.ts"] } },
    ];

    expect(describeQualityFinding(signals, t)?.detail).toContain("a/b/c.ts");
  });
});

describe("le verdict ne se trompe pas de mot", () => {
  it("dit « absent de votre demande » pour une invention", () => {
    const signals: Signals = [
      { code: "invented_paths", severity: "warning", params: { paths: ["a/b/c.ts"] } },
    ];

    expect(describeQualityFinding(signals, t)?.label).toBe(t("capsule.inventionDetected"));
  });

  it("dit « restructurée » pour une restructuration", () => {
    // Rien n'est absent de la demande ici : elle a changé de forme. Reprendre
    // le même verdict enverrait chercher une invention qui n'existe pas.
    const signals: Signals = [{ code: "structural_inflation", severity: "warning" }];

    expect(describeQualityFinding(signals, t)?.label).toBe(t("capsule.restructured"));
  });
});
