import { useCallback, useState } from "react";
import { Copy } from "lucide-react";
import type { DoctorReport } from "@/apps/desktop/shared/ipc-contract.js";
import { useT, type Translate } from "../shared/i18n.js";
import { Button } from "../shared/Button.js";

/**
 * L'onglet Diagnostic, extrait de `SettingsApp.tsx`.
 *
 * Il vit dans son propre module depuis qu'il a un second bouton : l'écran de
 * réglages touchait le plafond de lignes, et un onglet qui gagne un état
 * (copie en cours, réussie, échouée) n'a pas sa place au milieu de l'état
 * global de la fenêtre.
 */

/** Ce que la copie est en train de faire, pour ce que l'utilisateur en voit. */
type CopyStatus = "idle" | "copying" | "copied" | "error";

export interface DiagnosticTabProps {
  doctor: DoctorReport | null;
  running: boolean;
  onRunDoctor(): void;
}

export function DiagnosticTab({
  doctor,
  running,
  onRunDoctor,
}: Readonly<DiagnosticTabProps>): React.JSX.Element {
  const t = useT();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  const copyReport = useCallback(() => {
    setCopyStatus("copying");
    // Aucun argument, et surtout aucun texte : le processus principal
    // reconstruit le rapport, le formate et l'écrit lui-même dans le
    // presse-papiers. Le renderer ne fait que demander.
    void window.reqraft
      .copyDoctorReport()
      .then(() => {
        setCopyStatus("copied");
      })
      .catch(() => {
        setCopyStatus("error");
      });
  }, []);

  const hasReport = doctor !== null;
  const rerunDiagnostic = (): void => {
    setCopyStatus("idle");
    onRunDoctor();
  };

  return (
    <>
      {running && <p className="muted">{t("settings.diagnosticRunning")}</p>}
      <div className="diagnostic-list">
        {doctor?.checks.map((check) => (
          <div
            key={check.id}
            className={check.ok ? "diagnostic-row" : "diagnostic-row diagnostic-row-risk"}
          >
            <span className={check.ok ? "verdict-good" : "verdict-risky"}>
              {check.ok ? "✓" : "!"}
            </span>
            <span className="diagnostic-name">{check.id}</span>
            {check.detail !== undefined && (
              <span className="diagnostic-detail">{check.detail}</span>
            )}
          </div>
        ))}
      </div>
      <div className="settings-actions">
        {/* Le libellé ne change pas avec l'état : un bouton qui se renomme
            « Copié » change de largeur, et les deux actions voisines cessent
            d'être alignées. L'issue de la copie est annoncée à côté. */}
        <Button
          variant="neutral"
          onClick={copyReport}
          disabled={!hasReport || running || copyStatus === "copying"}
          aria-busy={copyStatus === "copying"}
        >
          <Copy size={13} aria-hidden />
          {t("settings.copyReport")}
        </Button>
        <Button variant="neutral" onClick={rerunDiagnostic} disabled={running}>
          {t("settings.rerunDiagnostic")}
        </Button>
      </div>
      {/* Toujours monté, même vide : une zone live ajoutée en même temps que
          son message n'est pas annoncée par un lecteur d'écran. */}
      <p className="settings-note muted" role="status">
        {copyStatusMessage(copyStatus, t)}
      </p>
    </>
  );
}

function copyStatusMessage(status: CopyStatus, t: Translate): string {
  if (status === "copying") return t("settings.copyingReport");
  if (status === "copied") return t("settings.reportCopied");
  if (status === "error") return t("settings.reportCopyFailed");
  return "";
}
