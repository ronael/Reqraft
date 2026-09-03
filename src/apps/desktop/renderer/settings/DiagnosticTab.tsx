import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import type { DoctorCheck, DoctorReport } from "@/apps/desktop/shared/ipc-contract.js";
import { useT, type Translate } from "../shared/i18n.js";
import { Button } from "../shared/Button.js";
import { InlineMessage, type MessageTone } from "../shared/InlineMessage.js";
import { Toast, useToast } from "../shared/Toast.js";
import {
  diagnosticRemedy,
  permissionPaneOf,
  targetTabOf,
  type DiagnosticAction,
  type DiagnosticActionKind,
  type DiagnosticTarget,
} from "./diagnostic-remedies.js";

/**
 * L'onglet Diagnostic : ce qui ne va pas, et quoi faire tout de suite.
 *
 * La liste seule ne servait qu'à constater. Chaque échec porte désormais une
 * phrase — la prochaine action — et, quand le desktop sait déjà la faire, la
 * commande elle-même : demander la permission, ouvrir son volet système,
 * reprendre les raccourcis suspendus, ou aller à l'onglet qui contient le
 * réglage fautif. Rien n'envoie vers le CLI : tout ce qui est proposé existe
 * dans cette fenêtre.
 *
 * Les échecs passent devant. Sur treize contrôles dont deux en défaut, une
 * liste dans l'ordre du rapport demande de la parcourir pour trouver les deux
 * lignes qui comptent ; les réussites gardent un groupe à elles, plus bas.
 * L'ordre du rapport copié, lui, ne change pas — il sert à comparer deux
 * machines, pas à être lu à l'écran.
 *
 * Le couple « Copier le rapport / Relancer » est monté dans l'en-tête de
 * section et non dans un pied : treize lignes plus un bloc d'action par échec
 * dépassent la fenêtre de 640 px, et une relance sous la ligne de flottaison
 * n'est pas une relance évidente.
 */

/**
 * Ce que la copie est en train de faire, pour ce que l'utilisateur en voit.
 *
 * La réussite n'y figure plus : « rapport copié » est un accusé de réception,
 * qui s'annonce et s'efface. Il occupait la ligne où se lit l'état du
 * diagnostic — la seule information durable de cet onglet — et la masquait
 * jusqu'au prochain clic. L'échec, lui, reste : il demande une décision.
 */
type CopyStatus = "idle" | "copying" | "error";

export interface DiagnosticTabProps {
  doctor: DoctorReport | null;
  running: boolean;
  /** Le diagnostic lui-même n'a pas pu s'exécuter (IPC rejeté). */
  failed: boolean;
  onRunDoctor(): void;
  /** Emmène vers l'onglet qui contient le réglage fautif. */
  onOpenTab(tab: DiagnosticTarget): void;
}

export function DiagnosticTab({
  doctor,
  running,
  failed,
  onRunDoctor,
  onOpenTab,
}: Readonly<DiagnosticTabProps>): React.JSX.Element {
  const t = useT();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [busyAction, setBusyAction] = useState<DiagnosticActionKind | null>(null);
  const { toast, show: annoncer, dismiss: fermerAnnonce } = useToast();
  const rerunOnReturn = useRef(false);

  const copyReport = useCallback(() => {
    setCopyStatus("copying");
    // Aucun argument, et surtout aucun texte : le processus principal
    // reconstruit le rapport, le formate et l'écrit lui-même dans le
    // presse-papiers. Le renderer ne fait que demander.
    void window.reqraft
      .copyDoctorReport()
      .then(() => {
        setCopyStatus("idle");
        annoncer(t("settings.reportCopied"));
      })
      .catch(() => {
        setCopyStatus("error");
      });
  }, [annoncer, t]);

  /**
   * Une permission accordée dans les Réglages système l'est hors de l'app.
   *
   * On ne peut donc pas relire l'état au moment du clic — la personne n'a même
   * pas encore quitté la fenêtre. Le retour du focus est le seul instant où la
   * réponse existe : le diagnostic est rejoué une fois, et la ligne devient
   * verte sans que quiconque ait à repenser à cliquer « Relancer ».
   */
  useEffect(() => {
    const onFocus = (): void => {
      if (!rerunOnReturn.current) return;
      rerunOnReturn.current = false;
      onRunDoctor();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [onRunDoctor]);

  const runAction = useCallback(
    (kind: DiagnosticActionKind) => {
      const tab = targetTabOf(kind);
      if (tab !== null) {
        // Navigation interne : instantanée, rien à attendre, rien à annoncer.
        onOpenTab(tab);
        return;
      }
      setBusyAction(kind);
      void performAction(kind)
        .then((announcementKey) => {
          annoncer(t(announcementKey));
          // Ce qui vient de changer est dans le processus principal : on relit
          // plutôt que de peindre un succès que rien n'a confirmé.
          if (kind !== "open-accessibility-settings" && kind !== "open-automation-settings") {
            onRunDoctor();
          }
        })
        .catch(() => {
          annoncer(t("settings.remedy.actionFailed"), "error");
        })
        .finally(() => {
          setBusyAction(null);
        });
      if (kind === "open-accessibility-settings" || kind === "open-automation-settings") {
        rerunOnReturn.current = true;
      }
    },
    [annoncer, onOpenTab, onRunDoctor, t],
  );

  const hasReport = doctor !== null;
  const checks = doctor?.checks ?? [];
  const failing = checks.filter((check) => !check.ok);
  const passing = checks.filter((check) => check.ok);
  const loading = running && !hasReport;
  const rerunDiagnostic = (): void => {
    setCopyStatus("idle");
    onRunDoctor();
  };
  const state: DiagnosticState = {
    hasReport,
    running,
    failed,
    copyStatus,
    failing: failing.length,
  };

  return (
    <>
      <section className="settings-section diagnostic-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.diagnosticChecks")}</h3>
          {/* En tête de section, jamais en pied : la relance doit rester
              visible quelle que soit la longueur de la liste en dessous. */}
          <div className="settings-actions diagnostic-head-actions">
            <Button
              variant="neutral"
              onClick={copyReport}
              disabled={!hasReport || running || copyStatus === "copying"}
              aria-busy={copyStatus === "copying"}
            >
              <Copy size={13} aria-hidden />
              {t("settings.copyReport")}
            </Button>
            <Button onClick={rerunDiagnostic} disabled={running} aria-busy={running}>
              <RefreshCw size={13} className={running ? "spin" : undefined} aria-hidden />
              {t("settings.rerunDiagnostic")}
            </Button>
          </div>
        </div>

        <div className="settings-messages diagnostic-summary">
          <InlineMessage
            tone={diagnosticTone(state)}
            role={failed || copyStatus === "error" ? "alert" : "status"}
          >
            {diagnosticMessage(state, t)}
          </InlineMessage>
        </div>

        {loading && <DiagnosticSkeleton />}

        {!loading && failing.length > 0 && (
          <div className="settings-group diagnostic-list">
            {failing.map((check) => (
              <FailingCheckRow
                key={check.id}
                check={check}
                busyAction={busyAction}
                onAction={runAction}
              />
            ))}
          </div>
        )}
      </section>

      {!loading && passing.length > 0 && (
        <section className="settings-section">
          <div className="settings-section-head">
            <h3 className="settings-subhead">
              {t("settings.diagnosticPassed", { count: String(passing.length) })}
            </h3>
          </div>
          <div className="settings-group">
            <div className="settings-group-rows diagnostic-list">
              {passing.map((check) => (
                <PassingCheckRow key={check.id} check={check} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Toast toast={toast} onDismiss={fermerAnnonce} />
    </>
  );
}

/**
 * Exécute une commande directe et rend la clé de son accusé de réception.
 *
 * Hors du composant : ce sont trois appels au pont, sans état de rendu, et les
 * garder ici laisse `runAction` lisible d'un seul tenant.
 */
async function performAction(kind: DiagnosticActionKind): Promise<string> {
  const pane = permissionPaneOf(kind);
  if (pane !== null) {
    await window.reqraft.openPermissionSettings(pane);
    // Le remède qui porte ce bouton n'est produit que sur macOS : ailleurs les
    // permissions passent, ou Wayland les remplace par le mode plancher.
    return "settings.remedy.systemSettingsOpened";
  }
  if (kind === "request-permissions") {
    await window.reqraft.requestPermissions();
    // macOS n'affiche l'invite qu'une fois : après un refus, elle ne revient
    // pas. L'annonce le dit plutôt que de laisser croire à un clic sans effet.
    return "settings.remedy.permissionRequested";
  }
  if (kind === "resume-shortcuts") {
    await window.reqraft.resumeShortcuts();
    return "settings.remedy.shortcutsResumed";
  }
  // Les navigations sont traitées avant `performAction`. Garder l'échec
  // explicite empêche une future action oubliée de reprendre les raccourcis
  // par accident.
  throw new Error(`unsupported diagnostic action: ${kind}`);
}

interface FailingCheckRowProps {
  check: DoctorCheck;
  busyAction: DiagnosticActionKind | null;
  onAction(kind: DiagnosticActionKind): void;
}

/**
 * Un contrôle en échec : ce qui ne va pas, puis quoi faire.
 *
 * Pas de pastille « Demande une action » ici — le groupe, l'icône et le résumé
 * l'ont déjà dit trois fois, et la largeur qu'elle prenait revient aux boutons.
 */
function FailingCheckRow({
  check,
  busyAction,
  onAction,
}: Readonly<FailingCheckRowProps>): React.JSX.Element {
  const t = useT();
  const remedy = diagnosticRemedy(check.remedy);
  return (
    <div className="settings-group-row diagnostic-row diagnostic-row-risk">
      <span className="settings-row-icon diagnostic-icon-risk">
        <TriangleAlert size={17} aria-hidden />
      </span>
      <span className="settings-group-copy">
        <span className="settings-row-title">{diagnosticCheckLabel(check.id, t)}</span>
        {check.detail !== undefined && (
          <span className="settings-row-detail diagnostic-detail">{check.detail}</span>
        )}
      </span>
      {remedy !== undefined && (
        <span className="settings-row-detail diagnostic-guidance">{t(remedy.guidanceKey)}</span>
      )}
      {remedy !== undefined && remedy.actions.length > 0 && (
        <span className="settings-row-control diagnostic-row-actions">
          {remedy.actions.map((action) => (
            <RemedyButton
              key={action.kind}
              action={action}
              busy={busyAction === action.kind}
              blocked={busyAction !== null}
              onRun={onAction}
            />
          ))}
        </span>
      )}
    </div>
  );
}

interface RemedyButtonProps {
  action: DiagnosticAction;
  busy: boolean;
  /** Une commande à la fois : deux réponses simultanées se contrediraient. */
  blocked: boolean;
  onRun(kind: DiagnosticActionKind): void;
}

function RemedyButton({
  action,
  busy,
  blocked,
  onRun,
}: Readonly<RemedyButtonProps>): React.JSX.Element {
  const t = useT();
  return (
    <Button
      variant={action.primary ? "violet" : "neutral"}
      disabled={blocked}
      aria-busy={busy}
      onClick={() => {
        onRun(action.kind);
      }}
    >
      {t(action.labelKey)}
    </Button>
  );
}

function PassingCheckRow({ check }: Readonly<{ check: DoctorCheck }>): React.JSX.Element {
  const t = useT();
  return (
    <div className="settings-group-row diagnostic-row">
      <span className="settings-row-icon diagnostic-icon-ok">
        <CircleCheck size={17} aria-hidden />
      </span>
      <span className="settings-group-copy">
        <span className="settings-row-title">{diagnosticCheckLabel(check.id, t)}</span>
        {check.detail !== undefined && (
          <span className="settings-row-detail diagnostic-detail">{check.detail}</span>
        )}
      </span>
      <span className="settings-state settings-state-ok">{t("settings.diagnosticOk")}</span>
    </div>
  );
}

/**
 * L'attente, à la forme de ce qui va arriver.
 *
 * Un onglet vide pendant que le diagnostic tourne se lit comme un onglet
 * cassé. Trois lignes grises de la bonne hauteur disent qu'il se remplit, et
 * la pulsation s'arrête sous `prefers-reduced-motion` (`.pulse`, desktop.css).
 */
function DiagnosticSkeleton(): React.JSX.Element {
  return (
    // `aria-hidden` : l'attente est déjà annoncée par le message d'état
    // au-dessus, et trois lignes vides lues à voix haute ne disent rien.
    <div className="settings-group diagnostic-list" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className="settings-group-row diagnostic-row diagnostic-row-skeleton">
          <span className="settings-row-icon">
            <span className="diagnostic-skeleton-dot pulse" />
          </span>
          <span className="settings-group-copy">
            <span className="diagnostic-skeleton-line pulse" />
            <span className="diagnostic-skeleton-line diagnostic-skeleton-line-short pulse" />
          </span>
          <span className="settings-row-control">
            <span className="diagnostic-skeleton-chip pulse" />
          </span>
        </div>
      ))}
    </div>
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

/** Tout ce dont le résumé a besoin, en un seul objet pour ne rien oublier. */
export interface DiagnosticState {
  hasReport: boolean;
  running: boolean;
  failed: boolean;
  copyStatus: CopyStatus;
  failing: number;
}

export function diagnosticTone(state: DiagnosticState): MessageTone {
  if (state.running || state.copyStatus === "copying") return "pending";
  if (state.failed) return "error";
  if (state.copyStatus === "error") return "error";
  if (!state.hasReport) return "info";
  return state.failing === 0 ? "success" : "warning";
}

export function diagnosticMessage(state: DiagnosticState, t: Translate): string {
  if (state.running) return t("settings.diagnosticRunning");
  // Avant tout le reste : un diagnostic qui n'a pas pu tourner ne dit rien de
  // l'installation, et laisser « Tout est en ordre » serait un mensonge.
  if (state.failed) return t("settings.diagnosticFailed");
  if (state.copyStatus === "copying") return t("settings.copyingReport");
  if (state.copyStatus === "error") return t("settings.reportCopyFailed");
  if (!state.hasReport) return t("settings.diagnosticReady");
  if (state.failing === 0) return t("settings.diagnosticAllClear");
  if (state.failing === 1) return t("settings.diagnosticIssue");
  return t("settings.diagnosticIssues", { count: String(state.failing) });
}
