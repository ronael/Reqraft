import { useCallback, useState } from "react";
import { CircleCheck, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import type { DoctorReport } from "@/apps/desktop/shared/ipc-contract.js";
import { useT, type Translate } from "../shared/i18n.js";
import { Button } from "../shared/Button.js";
import { InlineMessage, type MessageTone } from "../shared/InlineMessage.js";

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
  const failedCount = doctor?.checks.filter((check) => !check.ok).length ?? 0;
  const rerunDiagnostic = (): void => {
    setCopyStatus("idle");
    onRunDoctor();
  };

  return (
    <section className="settings-section diagnostic-section">
      <div className="settings-section-head">
        <h3 className="settings-subhead">{t("settings.diagnosticChecks")}</h3>
      </div>
      <div className="settings-group">
        <div className="settings-group-rows diagnostic-list">
          {doctor?.checks.map((check) => {
            const Icon = check.ok ? CircleCheck : TriangleAlert;
            return (
              <div key={check.id} className="settings-group-row diagnostic-row">
                <span
                  className={
                    check.ok
                      ? "settings-row-icon diagnostic-icon-ok"
                      : "settings-row-icon diagnostic-icon-risk"
                  }
                >
                  <Icon size={17} aria-hidden />
                </span>
                <span className="settings-group-copy">
                  <span className="settings-row-title">{diagnosticCheckLabel(check.id, t)}</span>
                  {check.detail !== undefined && (
                    <span className="settings-row-detail diagnostic-detail">{check.detail}</span>
                  )}
                </span>
                <span className={check.ok ? "settings-state settings-state-ok" : "settings-state"}>
                  {check.ok ? t("settings.diagnosticOk") : t("settings.diagnosticAttention")}
                </span>
              </div>
            );
          })}
        </div>
        <div className="settings-group-foot settings-group-foot-split">
          <InlineMessage tone={diagnosticTone(hasReport, running, copyStatus, failedCount)}>
            {diagnosticMessage(hasReport, running, copyStatus, failedCount, t)}
          </InlineMessage>
          <div className="settings-actions">
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
              <RefreshCw size={13} className={running ? "spin" : undefined} aria-hidden />
              {t("settings.rerunDiagnostic")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function diagnosticCheckLabel(id: string, t: Translate): string {
  const exact: Record<string, string> = {
    "config:file": "settings.diagnosticConfigFile",
    "config:defaults": "settings.diagnosticDefaults",
    "permissions:accessibility": "settings.diagnosticAccessibility",
    "permissions:automation": "settings.diagnosticAutomation",
    "permissions:replace": "settings.diagnosticReplacement",
    "shortcuts:capture": "settings.captureShortcut",
    "shortcuts:input": "settings.inputShortcut",
    "shortcuts:popover": "settings.popoverShortcut",
    "shortcuts:rejected": "settings.diagnosticRejectedShortcuts",
    "shortcuts:conflicts": "settings.diagnosticShortcutConflicts",
    "shortcuts:suspended": "settings.diagnosticShortcutState",
  };
  const key = exact[id];
  if (key !== undefined) return t(key);
  if (id.startsWith("provider:")) {
    return t("settings.diagnosticProvider", { provider: id.slice("provider:".length) });
  }
  return id;
}

function diagnosticTone(
  hasReport: boolean,
  running: boolean,
  copyStatus: CopyStatus,
  failedCount: number,
): MessageTone {
  if (running || copyStatus === "copying") return "pending";
  if (copyStatus === "copied") return "success";
  if (copyStatus === "error") return "error";
  if (!hasReport) return "info";
  return failedCount === 0 ? "success" : "warning";
}

function diagnosticMessage(
  hasReport: boolean,
  running: boolean,
  copyStatus: CopyStatus,
  failedCount: number,
  t: Translate,
): string {
  if (running) return t("settings.diagnosticRunning");
  if (copyStatus === "copying") return t("settings.copyingReport");
  if (copyStatus === "copied") return t("settings.reportCopied");
  if (copyStatus === "error") return t("settings.reportCopyFailed");
  if (!hasReport) return t("settings.diagnosticReady");
  if (failedCount === 0) return t("settings.diagnosticAllClear");
  if (failedCount === 1) return t("settings.diagnosticIssue");
  return t("settings.diagnosticIssues", { count: String(failedCount) });
}
