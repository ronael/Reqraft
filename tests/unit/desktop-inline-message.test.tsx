import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineMessage, type MessageTone } from "@/apps/desktop/renderer/shared/InlineMessage.js";

const TONES: MessageTone[] = ["info", "pending", "success", "warning", "error"];

describe("InlineMessage", () => {
  it("annonce par défaut sans interrompre", () => {
    const markup = renderToStaticMarkup(<InlineMessage tone="info">Rien à signaler</InlineMessage>);

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Rien à signaler");
  });

  it("laisse l'appelant demander une alerte", () => {
    const markup = renderToStaticMarkup(
      <InlineMessage tone="warning" role="alert">
        Raccourci pris
      </InlineMessage>,
    );

    expect(markup).toContain('role="alert"');
  });

  it("donne à chaque ton sa propre classe, sur la même boîte", () => {
    for (const tone of TONES) {
      const markup = renderToStaticMarkup(<InlineMessage tone={tone}>x</InlineMessage>);

      expect(markup).toContain(`class="inline-message inline-message-${tone}"`);
    }
  });

  it("ne fait tourner l'icône que sur une attente", () => {
    const pending = renderToStaticMarkup(<InlineMessage tone="pending">…</InlineMessage>);
    const settled = renderToStaticMarkup(<InlineMessage tone="success">ok</InlineMessage>);

    expect(pending).toContain("inline-message-icon spin");
    expect(settled).toContain("inline-message-icon");
    expect(settled).not.toContain("spin");
  });

  it("garde l'icône hors de la lecture", () => {
    const markup = renderToStaticMarkup(<InlineMessage tone="error">Échec</InlineMessage>);

    expect(markup).toContain('aria-hidden="true"');
  });

  it("accepte une classe de disposition sans perdre les siennes", () => {
    const markup = renderToStaticMarkup(
      <InlineMessage tone="info" className="layout-hook">
        x
      </InlineMessage>,
    );

    expect(markup).toContain('class="inline-message inline-message-info layout-hook"');
  });
});
