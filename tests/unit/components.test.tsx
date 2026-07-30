import React from "react";
import { describe, expect, it } from "vitest";
import { frameOf } from "../helpers/render.js";
import { Badge, StatusPill } from "../../src/ui/components/badge.js";
import { EmptyState } from "../../src/ui/components/empty-state.js";
import { ErrorState } from "../../src/ui/components/error-state.js";
import { KeyHint } from "../../src/ui/components/key-hint.js";
import { Panel } from "../../src/ui/components/panel.js";
import { Toast } from "../../src/ui/components/toast.js";
import { Notice } from "../../src/ui/components/notice.js";
import { ResultPanelBody } from "../../src/ui/components/result-panel-body.js";
import { theme } from "../../src/ui/theme/tokens.js";

describe("Panel", () => {
  it("shows the title and the metadata side by side", () => {
    const frame = frameOf(
      <Panel title="Prompt amélioré" meta="31 tokens · 1.12 s">
        <></>
      </Panel>,
    );

    expect(frame).toContain("Prompt amélioré");
    expect(frame).toContain("31 tokens · 1.12 s");
  });

  it("omits the metadata slot when there is nothing to report", () => {
    const frame = frameOf(
      <Panel title="Prompt original">
        <></>
      </Panel>,
    );

    expect(frame).toContain("Prompt original");
  });

  it("renders its children", () => {
    const frame = frameOf(
      <Panel title="Titre">
        <Badge label="profil" value="frontend" />
      </Panel>,
    );

    expect(frame).toContain("frontend");
  });

  it("drops the border entirely in inline tone", () => {
    const frame = frameOf(
      <Panel title="Sans cadre" tone="inline">
        <></>
      </Panel>,
    );

    expect(frame).not.toContain("─");
    expect(frame).not.toContain("│");
  });
});

describe("Badge", () => {
  it("pairs a label with its value", () => {
    expect(frameOf(<Badge label="niveau" value="standard" />)).toContain("niveau standard");
  });
});

describe("StatusPill", () => {
  it("prefixes the label with a symbol so colour is not the only signal", () => {
    const frame = frameOf(<StatusPill tone="success" label="terminé" />);

    expect(frame).toContain(theme.symbol.success);
    expect(frame).toContain("terminé");
  });
});

describe("KeyHint", () => {
  it("shows the key and what it does", () => {
    expect(frameOf(<KeyHint keyLabel="Ctrl+D" action="Diff" />)).toContain("Ctrl+D Diff");
  });

  it("stays visible when disabled, so the bar does not reflow", () => {
    expect(frameOf(<KeyHint keyLabel="Ctrl+D" action="Diff" disabled />)).toContain("Ctrl+D Diff");
  });
});

describe("EmptyState", () => {
  it("states what is missing and points at the next action", () => {
    const frame = frameOf(
      <EmptyState title="Aucun résultat pour le moment." action="Appuie sur Entrée." />,
    );

    expect(frame).toContain("Aucun résultat pour le moment.");
    expect(frame).toContain(`${theme.symbol.arrow} Appuie sur Entrée.`);
  });
});

describe("ErrorState", () => {
  it("lays out title, message, cause and next action", () => {
    const frame = frameOf(
      <ErrorState
        error={{
          title: "Clé API refusée",
          message: "La clé API openai a été refusée.",
          cause: "HTTP 401",
          nextAction: "Lance « rp auth login openai ».",
        }}
      />,
    );

    expect(frame).toContain("Clé API refusée");
    expect(frame).toContain("La clé API openai a été refusée.");
    expect(frame).toContain("HTTP 401");
    expect(frame).toContain("Lance « rp auth login openai ».");
  });

  it("omits the optional parts when they are unknown", () => {
    const frame = frameOf(<ErrorState error={{ title: "Erreur", message: "Panne réseau." }} />);

    expect(frame).toContain("Panne réseau.");
    expect(frame).not.toContain(theme.symbol.arrow);
  });
});

describe("Toast", () => {
  it("shows a confirmation with its symbol", () => {
    const frame = frameOf(<Toast message="Copié dans le presse-papiers." />);

    expect(frame).toContain("Copié dans le presse-papiers.");
    expect(frame).toContain(theme.symbol.success);
  });

  it("keeps its row when silent, so showing it never shifts the layout", () => {
    const silent = frameOf(<Toast message={null} />);
    const speaking = frameOf(<Toast message="Copié." />);

    expect(silent.split("\n")).toHaveLength(speaking.split("\n").length);
  });
});

describe("Notice", () => {
  it("carries the meaning in the symbol, not only in the colour", () => {
    expect(frameOf(<Notice tone="danger">Échec</Notice>)).toContain(`${theme.symbol.danger} Échec`);
  });
});

describe("streaming body", () => {
  const streaming = (partialText: string): string =>
    frameOf(
      <ResultPanelBody
        isLoading
        error={null}
        result={null}
        view="result"
        maxLines={20}
        partialText={partialText}
      />,
    );

  it("never shows the JSON envelope the provider actually sends", () => {
    const frame = streaming('{"rewritten":"Je souhaite un projet');

    expect(frame).toContain("Je souhaite un projet");
    expect(frame).not.toContain('"rewritten"');
    expect(frame).not.toContain("{");
  });

  it("shows real line breaks rather than escaped ones", () => {
    const frame = streaming('{"rewritten":"Objectif :\\n- Domaine');

    expect(frame).not.toContain("\\n");
    expect(frame).toContain("Objectif :");
    expect(frame).toContain("- Domaine");
  });

  it("spins instead of leaking a bare opening brace", () => {
    expect(streaming('{"chang')).not.toContain("{");
  });

  it("spins while nothing has arrived", () => {
    expect(streaming("")).toContain("Reformulation en cours");
  });
});
