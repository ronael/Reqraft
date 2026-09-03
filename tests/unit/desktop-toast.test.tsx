import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Toast,
  TOAST_MAX_MS,
  TOAST_MIN_MS,
  toastDurationMs,
  type ToastState,
  type ToastTone,
} from "@/apps/desktop/renderer/shared/Toast.js";

/**
 * L'annonce passagère.
 *
 * `InlineMessage` reste le message qui dure ; celui-ci confirme puis part. Ce
 * qui se vérifie ici est ce que « passagère » implique et que le rendu seul ne
 * dirait pas : combien de temps elle reste selon ce qu'il y a à lire, comment
 * elle s'annonce aux lecteurs d'écran, et où elle se pose — la suite tourne
 * sous Node sans DOM, donc la position se lit dans la feuille de style.
 */

const STYLESHEET = "src/apps/desktop/renderer/shared/desktop.css";

const TONES: ToastTone[] = ["info", "success", "warning", "error"];

function annonce(text: string, tone: ToastTone = "success"): ToastState {
  return { id: 1, text, tone };
}

function rendu(toast: ToastState | null): string {
  return renderToStaticMarkup(<Toast toast={toast} onDismiss={() => undefined} />);
}

/** Les déclarations d'une règle, à partir de son sélecteur exact. */
async function ruleBody(selector: string): Promise<string> {
  const css = await readFile(STYLESHEET, "utf8");
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `règle ${selector} introuvable`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("durée d'affichage", () => {
  it("laisse au moins le temps de trouver le message", () => {
    expect(toastDurationMs("")).toBe(TOAST_MIN_MS);
    expect(toastDurationMs("Copié.")).toBe(TOAST_MIN_MS);
  });

  it("s'allonge avec ce qu'il y a à lire", () => {
    // Une durée fixe traiterait « Copié » et une phrase de deux lignes de la
    // même façon : trop longue pour l'une, trop courte pour l'autre.
    const court = toastDurationMs("Résultat copié.");
    const long = toastDurationMs("Résultat copié.".repeat(8));

    expect(long).toBeGreaterThan(court);
  });

  it("ne s'installe jamais", () => {
    expect(toastDurationMs("x".repeat(10_000))).toBe(TOAST_MAX_MS);
  });
});

describe("rendu de l'annonce", () => {
  it("ne rend rien tant qu'il n'y a rien à annoncer", () => {
    expect(rendu(null)).toBe("");
  });

  it("annonce sans interrompre une confirmation", () => {
    const markup = rendu(annonce("Résultat copié."));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Résultat copié.");
  });

  it.each<ToastTone>(["warning", "error"])("interrompt pour un %s", (tone) => {
    // Une confirmation attend une pause ; un problème ne peut pas se permettre
    // d'être lu après le reste.
    const markup = rendu(annonce("Échec", tone));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
  });

  it("donne à chaque ton sa classe, sur la même boîte", () => {
    for (const tone of TONES) {
      expect(rendu(annonce("x", tone))).toContain(`class="toast toast-${tone}"`);
    }
  });

  it("porte une icône, et la garde hors de la lecture", () => {
    const markup = rendu(annonce("Résultat copié."));

    expect(markup).toContain("<svg");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("se pose dans sa propre couche, au-dessus du contenu", () => {
    expect(rendu(annonce("x"))).toContain('class="toast-layer"');
  });
});

describe("place de l'annonce dans la fenêtre", () => {
  it("ne défile pas avec le contenu et ne déplace rien", async () => {
    const layer = await ruleBody(".toast-layer");

    expect(layer).toContain("position: fixed");
    // Rien de ce qu'elle survole ne devient incliquable.
    expect(layer).toContain("pointer-events: none");
  });

  it("borne sa largeur au lieu de traverser la fenêtre", async () => {
    expect(await ruleBody(".toast")).toContain("max-width:");
  });

  it("se pose au-dessus du pied, jamais dessus", async () => {
    // Popover et réglages ont un pied fixe. La capsule, dont le verdict peut
    // prendre plusieurs lignes, s'ancre au bord réel de son pied.
    expect(await ruleBody(".toast-layer")).toContain("bottom: var(--rq-toast-offset");

    for (const surface of [".popover", ".settings"]) {
      expect(await ruleBody(surface), `${surface} doit déclarer son décalage`).toContain(
        "--rq-toast-offset:",
      );
    }

    expect(await ruleBody(".capsule-bottom")).toContain("position: relative");
    const capsuleLayer = await ruleBody(".capsule-bottom > .toast-layer");
    expect(capsuleLayer).toContain("position: absolute");
    expect(capsuleLayer).toContain("bottom: calc(100% + 12px)");
  });

  it("réduit son mouvement quand le système le demande", async () => {
    const css = await readFile(STYLESHEET, "utf8");
    const reduction = css.slice(css.indexOf("@keyframes rq-toast-in"));

    expect(reduction).toContain("@media (prefers-reduced-motion: reduce)");
    // `both` conserve l'état final : le message reste visible, il n'arrive plus.
    expect(await ruleBody(".toast")).toContain("animation: rq-toast-in");
  });
});
