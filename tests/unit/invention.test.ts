import { describe, expect, it } from "vitest";
import { detectInventedCommands, detectInventedPaths } from "@/core/invention.js";
import { assessFidelity } from "@/core/fidelity.js";
import { BENCHMARK_DATASET } from "../../benchmark/cases/dataset.js";

/**
 * Roadmap « Later — fidélité et qualité » : détections locales des chemins et
 * des commandes ajoutés par la reformulation.
 *
 * Ce sont les inventions les plus coûteuses — elles ont l'air d'un fait
 * vérifié, et quelqu'un les exécutera. Elles se contrôlent localement, sans
 * appel réseau, ce qui préserve le caractère local-first.
 *
 * Le repérage doit rester conservateur : un avertissement qui se déclenche sur
 * une phrase ordinaire finit par être ignoré, et on perd aussi les vrais.
 */

describe("chemins inventés", () => {
  it("repère un chemin apparu dans la sortie", () => {
    expect(
      detectInventedPaths("corrige la session utilisateur", "modifie src/auth/session.ts"),
    ).toEqual(["src/auth/session.ts"]);
  });

  it("ne signale pas un chemin déjà présent dans la demande", () => {
    expect(
      detectInventedPaths("corrige src/auth/session.ts", "corrige le fichier src/auth/session.ts"),
    ).toEqual([]);
  });

  it("ignore la casse : un chemin recopié reste le même chemin", () => {
    expect(detectInventedPaths("voir src/Auth/Session.ts", "voir src/auth/session.ts")).toEqual([]);
  });

  it("repère un simple nom de fichier, sans dossier", () => {
    expect(detectInventedPaths("mets à jour la config", "mets à jour tsconfig.json")).toEqual([
      "tsconfig.json",
    ]);
  });

  it("ne prend pas une URL pour un fichier du projet", () => {
    // Une référence n'est pas un fichier inventé du dépôt.
    expect(
      detectInventedPaths("documente l'API", "voir https://exemple.fr/docs/api et www.exemple.fr"),
    ).toEqual([]);
  });

  it("ne prend pas une date, une fraction ou une version pour un chemin", () => {
    expect(
      detectInventedPaths("prévois la sortie", "le 12/03, environ 3/4 des cas, v1.2/1.3"),
    ).toEqual([]);
  });

  it("ne prend pas « et/ou » pour un chemin", () => {
    expect(detectInventedPaths("écris la note", "ajoute une note et/ou un exemple")).toEqual([]);
  });

  it("ne signale rien sur une demande ordinaire sans technique", () => {
    // Le cas le plus fréquent doit être silencieux, sinon l'avertissement perd
    // toute valeur.
    expect(
      detectInventedPaths(
        "je voudrais quon fasse le point demain",
        "Faisons le point demain — peux-tu me confirmer un créneau ?",
      ),
    ).toEqual([]);
  });

  it("rend une liste triée et sans doublon", () => {
    const found = detectInventedPaths("rien", "touche src/b.ts puis src/a.ts puis src/b.ts");

    expect(found).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("commandes inventées", () => {
  it("repère une commande apparue dans la sortie", () => {
    expect(detectInventedCommands("lance les migrations", "exécute pnpm run migrate")).toEqual([
      "pnpm run",
    ]);
  });

  it("ne signale pas une commande déjà demandée", () => {
    expect(detectInventedCommands("lance pnpm run migrate", "exécute `pnpm run migrate`")).toEqual(
      [],
    );
  });

  it("distingue deux sous-commandes du même programme", () => {
    // `git` seul ne dit rien : une demande qui mentionne `git status` ne doit
    // pas autoriser un `git push` inventé.
    expect(detectInventedCommands("fais un git status", "fais un git push")).toEqual(["git push"]);
  });

  it("ne signale rien quand aucun programme connu n'apparaît", () => {
    expect(
      detectInventedCommands("écris un mail à Paul", "Écris un message à Paul pour lundi."),
    ).toEqual([]);
  });

  it("repère une commande destructrice ajoutée de son propre chef", () => {
    // Le cas qui justifie la détection : la sortie propose une action que
    // personne n'a demandée.
    expect(detectInventedCommands("nettoie le dossier", "lance rm -rf build")).toEqual(["rm -rf"]);
  });

  it("ne confond pas les verbes anglais go et make avec des commandes", () => {
    expect(detectInventedCommands("plan a trip", "go to Paris tomorrow")).toEqual([]);
    expect(detectInventedCommands("review this", "make sure the result is correct")).toEqual([]);
  });

  it("reconnaît go et make dans un contexte de commande explicite", () => {
    expect(detectInventedCommands("rien", "exécute `go test ./...`")).toEqual(["go test"]);
    expect(detectInventedCommands("rien", "lance make build")).toEqual(["make build"]);
  });
});

describe("robustesse", () => {
  it("survit à un chemin qui contient des caractères d'expression régulière", () => {
    // Le chemin sert de motif pour retirer ce qui a déjà été reconnu : non
    // échappé, une parenthèse dans un nom de dossier faisait lever le RegExp.
    expect(() =>
      detectInventedPaths("rien", "touche src/(group)/page.tsx et a+b/c.ts"),
    ).not.toThrow();
  });

  it("ne confond pas deux chemins qui ne diffèrent que par un point", () => {
    const found = detectInventedPaths("rien", "src/a.ts puis srcXaXts");

    expect(found).toEqual(["src/a.ts"]);
  });
});

describe("le signal remonte jusqu'à l'évaluation de fidélité", () => {
  it("avertit sur un chemin inventé, et dit lequel", () => {
    const quality = assessFidelity(
      "corrige la session utilisateur",
      "Corrige la session dans src/auth/session.ts.",
      "balanced",
      "standard",
    );

    const signal = quality.signals.find((entry) => entry.code === "invented_paths");
    expect(signal?.severity).toBe("warning");
    // Ce qui est affiché est ce qui a été inventé, pas une catégorie : sans le
    // chemin, l'avertissement n'est pas vérifiable.
    expect(signal && "params" in signal ? signal.params : undefined).toEqual({
      paths: ["src/auth/session.ts"],
    });
    expect(quality.status).toBe("review");
  });

  it("se contente d'informer en mode permissif", () => {
    const quality = assessFidelity("nettoie", "lance rm -rf build", "permissive", "standard");

    expect(quality.signals.find((entry) => entry.code === "invented_commands")?.severity).toBe(
      "info",
    );
    // `info` ne dégrade pas le verdict : la reformulation reste bonne.
    expect(quality.status).toBe("good");
  });

  it("ne dit rien sur une reformulation ordinaire", () => {
    const quality = assessFidelity(
      "je voudrais quon fasse le point demain",
      "Faisons le point demain — peux-tu me confirmer un créneau ?",
      "strict",
      "standard",
    );

    expect(quality.signals.map((entry) => entry.code)).not.toContain("invented_paths");
    expect(quality.signals.map((entry) => entry.code)).not.toContain("invented_commands");
  });
});

describe("ponctuation", () => {
  it("ne prend pas le point d'une phrase pour la fin du chemin", () => {
    expect(detectInventedPaths("rien", "Corrige src/auth/session.ts.")).toEqual([
      "src/auth/session.ts",
    ]);
  });

  it("laisse l'extension tranquille", () => {
    expect(detectInventedPaths("rien", "ouvre tsconfig.json, puis package.json")).toEqual([
      "package.json",
      "tsconfig.json",
    ]);
  });

  it("retire une parenthèse fermante de fin", () => {
    expect(detectInventedPaths("rien", "(voir src/a.ts)")).toEqual(["src/a.ts"]);
  });
});

describe("la profondeur suffit à faire un chemin", () => {
  it("repère un dossier à trois niveaux, même sans extension", () => {
    expect(detectInventedPaths("range le module", "range-le dans src/auth/session")).toEqual([
      "src/auth/session",
    ]);
  });

  it("mais deux mots séparés par un slash n'en font pas un", () => {
    expect(detectInventedPaths("écris la note", "ajoute une note client/interne")).toEqual([]);
  });
});

describe("silence sur le corpus réel", () => {
  it("ne signale rien quand la sortie ne fait que reprendre la demande", () => {
    // Les 46 cas du jeu de données, renvoyés tels quels : aucune invention n'a
    // eu lieu, donc aucun avertissement ne doit apparaître. C'est la promesse
    // « conservateur » tenue face à un corpus réel plutôt qu'à des exemples
    // choisis — un détecteur qui crie sur une demande honnête est pire
    // qu'absent.
    const noisy: string[] = [];
    for (const benchmarkCase of BENCHMARK_DATASET) {
      const echoed = `[mock] ${benchmarkCase.input}`;
      const paths = detectInventedPaths(benchmarkCase.input, echoed);
      const commands = detectInventedCommands(benchmarkCase.input, echoed);
      if (paths.length > 0 || commands.length > 0) {
        noisy.push(`${benchmarkCase.id} → ${paths.join(", ")} ${commands.join(", ")}`);
      }
    }

    expect(noisy, noisy.join("\n")).toEqual([]);
  });
});
